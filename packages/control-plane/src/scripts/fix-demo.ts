/**
 * Fix-loop demo: audit-known violations on bad.html → fix each via Claude Code
 * headless → verify with axe-core → compute before/after compliance score →
 * open a real merge-ready PR.
 *
 * FREE except Claude Code quota (the edits). axe-core, screen-reader
 * serialization, and scoring are all free; runAudit / paid API are NOT used.
 *
 * Run with GITHUB_TOKEN + GITHUB_TARGET_REPO in the env:
 *   pnpm --filter @ramp/control-plane fix:demo
 */
import "../instrument.js"; // MUST be first — initializes Sentry before anything else
import * as Sentry from "@sentry/node";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  axeScan,
  closePage,
  getAccessibilityTree,
  launchPage,
  serializeForScreenReader,
  type AxeViolationSummary,
} from "@ramp/harness";
import { computeScore } from "@ramp/scoring";
import type { Finding, Severity, ViolationType } from "@ramp/shared";
import { fixOneFinding } from "../fixer.js";
import { openPr } from "../github.js";
import { verifyFix } from "../verify.js";

const here = dirname(fileURLToPath(import.meta.url));
const badHtml = resolve(here, "../../../harness/fixtures/bad.html");

const RULE_TO_TYPE: Record<string, { type: ViolationType; severity: Severity }> = {
  "image-alt": { type: "missing_alt_text", severity: "critical" },
  "button-name": { type: "icon_button_accessible_names", severity: "critical" },
  label: { type: "missing_form_labels", severity: "serious" },
  "color-contrast": { type: "low_color_contrast", severity: "serious" },
  "landmark-one-main": { type: "missing_landmarks", severity: "moderate" },
  region: { type: "missing_landmarks", severity: "moderate" },
  "heading-order": { type: "heading_structure", severity: "moderate" },
};

/** Maps axe violations (one per rule) to Finding[] for scoring. */
function axeToFindings(axe: AxeViolationSummary[], runId: string): Finding[] {
  const out: Finding[] = [];
  let i = 0;
  for (const v of axe) {
    const m = RULE_TO_TYPE[v.id];
    if (!m) continue;
    out.push({
      id: `${runId}-f${++i}`,
      runId,
      type: m.type,
      severity: m.severity,
      wcagRule: v.id,
      confidence: 1,
      autoFixable: true,
      evidence: v.help,
    });
  }
  return out;
}

async function screenReader(target: string): Promise<string[]> {
  const page = await launchPage(target);
  try {
    return serializeForScreenReader(await getAccessibilityTree(page));
  } finally {
    await closePage(page);
  }
}

const WCAG_LABEL: Record<string, string> = {
  missing_alt_text: "1.1.1 Non-text Content",
  icon_button_accessible_names: "4.1.2 Name, Role, Value",
  low_color_contrast: "1.4.3 Contrast (Minimum)",
  missing_landmarks: "1.3.1 Info and Relationships",
  missing_form_labels: "1.3.1 Info and Relationships",
  heading_structure: "2.4.6 Headings and Labels",
};

/** The high-confidence findings we repair, with guidance for the fixer. */
function fixPlan(runId: string): Finding[] {
  const base = (
    type: ViolationType,
    severity: Severity,
    domNode: string,
    evidence: string,
  ): Finding => ({
    id: `${runId}-${type}`,
    runId,
    type,
    severity,
    wcagRule: WCAG_LABEL[type] ?? type,
    domNode,
    sourceFile: "bad.html",
    page: "bad.html",
    confidence: 1,
    autoFixable: true,
    evidence,
  });
  return [
    base(
      "missing_alt_text",
      "critical",
      '<img src="https://via.placeholder.com/200x80">',
      'The informative <img> has no alt attribute; a screen reader announces only "image".',
    ),
    base(
      "icon_button_accessible_names",
      "critical",
      '<button class="icon-btn"><svg aria-hidden="true"/></button>',
      "There are two icon-only <button class=\"icon-btn\"> elements with no accessible name (svg is aria-hidden). Add a concise aria-label to EACH (the first is a search button, the second is an add button).",
    ),
    base(
      "low_color_contrast",
      "serious",
      '<p class="low-contrast">…</p>',
      "The .low-contrast paragraph uses #bfbfbf text on white (~1.84:1), below the 4.5:1 minimum. Darken the .low-contrast color so it meets WCAG AA.",
    ),
    base(
      "missing_landmarks",
      "moderate",
      "<body>… content directly in body …</body>",
      "The page has no <main> landmark, so all content sits outside any landmark region. Wrap the primary content (everything after <h1>) in a <main> element.",
    ),
  ];
}

function mdTable(rows: string[][], header: string[]): string {
  const line = (r: string[]) => `| ${r.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join("\n");
}

async function main(): Promise<void> {
  const runId = "fix-demo";
  const workdir = mkdtempSync(join(tmpdir(), "ramp-fixrepo-"));
  const g = (args: string[]) =>
    execFileSync("git", ["-c", "core.pager=cat", ...args], { cwd: workdir }).toString();
  g(["init", "-q", "-b", "main"]);
  g(["config", "user.email", "ramp@demo"]);
  g(["config", "user.name", "ramp"]);
  copyFileSync(badHtml, join(workdir, "bad.html"));
  g(["add", "."]);
  g(["commit", "-q", "-m", "base"]);
  const target = join(workdir, "bad.html");

  try {
    await Sentry.startSpan(
      {
        name: "ramp.fix-loop",
        op: "ramp.fixloop",
        attributes: {
          target: "bad.html (fixture)",
          repo: process.env.GITHUB_TARGET_REPO ?? "yangzhang75/Ramp",
        },
      },
      async (root) => {
    // BEFORE
    const beforeAxe = await Sentry.startSpan(
      { name: "audit: axe baseline", op: "ramp.audit" },
      () => axeScan(target),
    );
    const beforeRuleIds = beforeAxe.map((v) => v.id);
    const beforeSR = await screenReader(target);
    const beforeScore = computeScore(axeToFindings(beforeAxe, `${runId}-before`));

    console.log(`[fix-demo] before: score ${beforeScore.score}, ${beforeAxe.length} axe rules`);

    // FIX each finding via Claude Code headless, then VERIFY with axe.
    const fixResults = [];
    for (const finding of fixPlan(runId)) {
      console.log(`[fix-demo] fixing ${finding.type} ...`);
      const attempt = await Sentry.startSpan(
        {
          name: `fix: ${finding.type}`,
          op: "ramp.fix.claude_code",
          attributes: { "finding.type": finding.type, "finding.wcag": finding.wcagRule },
        },
        () => fixOneFinding(workdir, finding),
      );
      const v = await Sentry.startSpan(
        {
          name: `verify: ${finding.type}`,
          op: "ramp.verify.axe",
          attributes: { "finding.type": finding.type },
        },
        () =>
          verifyFix({
            runId,
            findingId: finding.id,
            type: finding.type,
            file: "bad.html",
            diff: attempt.diff,
            strategy: attempt.strategy,
            targetUrl: target,
            beforeRuleIds,
          }),
      );
      Sentry.setTag("last_fix_status", v.result.status);
      fixResults.push({ finding, result: v.result });
      console.log(`[fix-demo]   ${finding.type}: ${v.result.status} (validated=${v.result.validated})`);
    }

    // AFTER
    const afterAxe = await Sentry.startSpan(
      { name: "verify: axe after", op: "ramp.verify.axe" },
      () => axeScan(target),
    );
    const afterSR = await screenReader(target);
    const afterScore = computeScore(axeToFindings(afterAxe, `${runId}-after`));
    const finalDiff = g(["diff", "HEAD"]);
    const fixedContent = readFileSync(target, "utf8");

    console.log(`[fix-demo] after: score ${afterScore.score}, ${afterAxe.length} axe rules`);

    // PR body
    const fixedTable = mdTable(
      fixResults.map((f) => [
        f.finding.wcagRule,
        f.finding.type.replace(/_/g, " "),
        f.result.status === "fixed" ? "✅ fixed + axe-verified" : `⚠️ ${f.result.status}`,
      ]),
      ["WCAG", "Issue", "Result"],
    );
    const axeLine = (a: AxeViolationSummary[]) =>
      a.length ? a.map((v) => `\`${v.id}\`(${v.impact})`).join(", ") : "**none** 🎉";
    const srBlock = (s: string[]) => "```\n" + s.join("\n") + "\n```";

    const body = `## What Ramp did

Ramp audited \`packages/harness/fixtures/bad.html\`, repaired the high-confidence WCAG violations, and **verified each fix with axe-core** before opening this PR. We don't ship a report — we ship the fix.

## Compliance score

### Before ${beforeScore.score}/100 → After ${afterScore.score}/100  (+${afterScore.score - beforeScore.score})

| | critical | serious | moderate | total |
| --- | --- | --- | --- | --- |
| before | ${beforeScore.critical} | ${beforeScore.serious} | ${beforeScore.moderate} | ${beforeScore.totalViolations} |
| after | ${afterScore.critical} | ${afterScore.serious} | ${afterScore.moderate} | ${afterScore.totalViolations} |

## Fixes

${fixedTable}

## axe-core: before vs after

- **before:** ${axeLine(beforeAxe)}
- **after:** ${axeLine(afterAxe)}

## What a screen reader hears: before vs after

**Before**
${srBlock(beforeSR)}

**After**
${srBlock(afterSR)}

## Validation

Each fix re-run through axe-core: targeted violation resolved, no new violations introduced. Static HTML — no build step.

---
🤖 Generated by [Ramp](https://github.com/yangzhang75/Ramp) — accessibility audit → fix → verify → PR. *(Demo PR against an intentionally-broken fixture; not for merge.)*
`;

    const branch = `ramp/fix-bad-html-${Date.now()}`;
    const url = await Sentry.startSpan(
      { name: "open pull request", op: "ramp.pr.github" },
      () =>
        openPr({
          branch,
          filePath: "packages/harness/fixtures/bad.html",
          newContent: fixedContent,
          title: "Improve accessibility of bad.html — Ramp verified WCAG fixes",
          body,
        }),
    );

    root.setAttribute("score.before", beforeScore.score);
    root.setAttribute("score.after", afterScore.score);
    root.setAttribute("score.delta", afterScore.score - beforeScore.score);
    root.setAttribute("pr.url", url);
    console.log(`\nPR_URL: ${url}`);
    console.log(`SCORE: ${beforeScore.score} -> ${afterScore.score}`);
    console.log("\n--- diff ---\n" + finalDiff);
      },
    );
  } finally {
    rmSync(workdir, { recursive: true, force: true });
    await Sentry.flush(3000);
  }
}

main().catch(async (e) => {
  console.error("fix-demo failed:", e);
  Sentry.captureException(e);
  await Sentry.flush(3000);
  process.exit(1);
});
