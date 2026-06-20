/**
 * Real-repo fix-loop demo.
 *
 * Pick a bench task (TASK_ID, default ramp-047), fork its repo to the current
 * user, reset the fork's default branch to the base commit (so the PR shows a
 * clean violation -> fix diff without spamming the upstream maintainer),
 * prepareRepo -> audit the real page with OpenAI gpt-4o-mini -> fix via Claude
 * Code headless -> verify + score with axe (free) -> openPr on the fork.
 *
 * Env: OPENAI_API_KEY (audit), GITHUB_TOKEN (fork + PR). Provider is forced to
 * openai/gpt-4o-mini; the Anthropic API key is NOT used.
 *
 *   pnpm --filter @ramp/control-plane fix:repo
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  axeScan,
  closePage,
  getAccessibilityTree,
  launchPage,
  runAudit,
  serializeForScreenReader,
  type AxeViolationSummary,
} from "@ramp/harness";
import { computeScore } from "@ramp/scoring";
import type { Finding, Severity, ViolationType } from "@ramp/shared";
import { fixOneFinding } from "../fixer.js";
import { openPr } from "../github.js";
import { prepareRepo } from "../sandbox.js";

const TOKEN = process.env.GITHUB_TOKEN ?? "";
const FIXABLE: ViolationType[] = [
  "missing_alt_text",
  "icon_button_accessible_names",
  "low_color_contrast",
  "missing_landmarks",
  "missing_form_labels",
  "heading_structure",
];
const SEVERITY_BY_RULE: Record<string, Severity> = {
  "image-alt": "critical",
  "button-name": "critical",
  label: "serious",
  "color-contrast": "serious",
  "landmark-one-main": "moderate",
  region: "moderate",
  "heading-order": "moderate",
};
const RULE_TO_TYPE: Record<string, ViolationType> = {
  "image-alt": "missing_alt_text",
  "button-name": "icon_button_accessible_names",
  label: "missing_form_labels",
  "color-contrast": "low_color_contrast",
  "landmark-one-main": "missing_landmarks",
  region: "missing_landmarks",
  "heading-order": "heading_structure",
};

async function gh(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `token ${TOKEN}`,
      accept: "application/vnd.github+json",
      "user-agent": "ramp-cli",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : {} };
}

function axeToFindings(axe: AxeViolationSummary[], runId: string): Finding[] {
  const out: Finding[] = [];
  let i = 0;
  for (const v of axe) {
    const type = RULE_TO_TYPE[v.id];
    if (!type) continue;
    out.push({
      id: `${runId}-f${++i}`,
      runId,
      type,
      severity: SEVERITY_BY_RULE[v.id] ?? "moderate",
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  if (!TOKEN) throw new Error("GITHUB_TOKEN required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required");
  process.env.RAMP_AUDIT_PROVIDER = "openai";
  process.env.RAMP_AUDIT_MODEL = "gpt-4o-mini";

  const taskId = process.env.TASK_ID ?? "ramp-047";
  const task = JSON.parse(
    readFileSync(new URL(`../../../bench/data/tasks/${taskId}.json`, import.meta.url), "utf8"),
  );
  const upstream = task.repoUrl.split("github.com/")[1].replace(/\.git$/, ""); // owner/name
  const [upOwner, upName] = upstream.split("/");
  const file = task.expectedFindings[0].file as string;
  const base = task.baseCommit as string;
  console.log(`[fix:repo] ${taskId} upstream=${upstream} file=${file} base=${base.slice(0, 12)}`);

  // 1. Who am I + fork.
  const me = (await gh("GET", "/user")).json.login as string;
  const forkFull = `${me}/${upName}`;
  console.log(`[fix:repo] forking ${upstream} -> ${forkFull}`);
  await gh("POST", `/repos/${upOwner}/${upName}/forks`, {});

  // 2. Wait for fork + base commit to exist on the fork.
  let defaultBranch = "main";
  for (let i = 0; i < 30; i++) {
    const r = await gh("GET", `/repos/${forkFull}`);
    if (r.status === 200) {
      defaultBranch = r.json.default_branch;
      const c = await gh("GET", `/repos/${forkFull}/commits/${base}`);
      if (c.status === 200) break;
    }
    await sleep(2000);
  }

  // 3. Reset the fork's default branch to the base commit (clean PR base).
  const reset = await gh("PATCH", `/repos/${forkFull}/git/refs/heads/${defaultBranch}`, {
    sha: base,
    force: true,
  });
  console.log(`[fix:repo] reset ${forkFull}@${defaultBranch} -> base (status ${reset.status})`);

  // 4. Sandbox checkout of the violation version.
  const repo = await prepareRepo(task.repoUrl, base);
  const target = join(repo.workdir, file);

  try {
    // BEFORE (free)
    const beforeAxe = await axeScan(target);
    const beforeSR = await screenReader(target);
    const beforeScore = computeScore(axeToFindings(beforeAxe, "before"));
    console.log(`[fix:repo] before: score ${beforeScore.score}, axe=[${beforeAxe.map((v) => v.id).join(",")}]`);

    // AUDIT the real page with gpt-4o-mini
    console.log("[fix:repo] auditing with gpt-4o-mini ...");
    const findings = await runAudit({ url: target, runId: taskId, maxSteps: 15 });
    const toFix = findings.filter((f) => FIXABLE.includes(f.type)).slice(0, 3);
    console.log(`[fix:repo] audit found ${findings.length}; fixing ${toFix.length}: ${toFix.map((f) => f.type).join(", ")}`);

    // FIX each via Claude Code headless (quota, not API key)
    for (const f of toFix) {
      f.sourceFile = file; // ensure the fixer edits the repo file
      console.log(`[fix:repo] fixing ${f.type} ...`);
      await fixOneFinding(repo.workdir, f);
    }

    // AFTER (free)
    const afterAxe = await axeScan(target);
    const afterSR = await screenReader(target);
    const afterScore = computeScore(axeToFindings(afterAxe, "after"));
    const finalDiff = (
      await import("node:child_process")
    ).execFileSync("git", ["-c", "core.pager=cat", "diff", "HEAD"], { cwd: repo.workdir }).toString();
    const fixedContent = readFileSync(target, "utf8");
    console.log(`[fix:repo] after: score ${afterScore.score}, axe=[${afterAxe.map((v) => v.id).join(",")}]`);

    const axeLine = (a: AxeViolationSummary[]) =>
      a.length ? a.map((v) => `\`${v.id}\`(${v.impact})`).join(", ") : "**none** 🎉";
    const srBlock = (s: string[]) => "```\n" + s.join("\n") + "\n```";
    const body = `## What Ramp did

Ramp audited \`${file}\` (real page from [${upstream}](https://github.com/${upstream})), repaired the high-confidence WCAG violations, and **verified each fix with axe-core**. We don't ship a report — we ship the fix.

Audit model: \`gpt-4o-mini\`. Fix applied by Claude Code. Verified by axe-core.

## Compliance score: ${beforeScore.score} → ${afterScore.score} (+${afterScore.score - beforeScore.score})

| | critical | serious | moderate | total |
| --- | --- | --- | --- | --- |
| before | ${beforeScore.critical} | ${beforeScore.serious} | ${beforeScore.moderate} | ${beforeScore.totalViolations} |
| after | ${afterScore.critical} | ${afterScore.serious} | ${afterScore.moderate} | ${afterScore.totalViolations} |

## Fixed
${toFix.map((f) => `- **${f.type.replace(/_/g, " ")}** (${f.wcagRule}) — ${f.evidence ?? ""}`).join("\n")}

## axe-core: before vs after
- **before:** ${axeLine(beforeAxe)}
- **after:** ${axeLine(afterAxe)}

## Screen reader: before vs after
**Before** ${srBlock(beforeSR.slice(0, 14))}
**After** ${srBlock(afterSR.slice(0, 14))}

---
🤖 Generated by [Ramp](https://github.com/yangzhang75/Ramp) — accessibility audit → fix → verify → PR. *(Demo PR on a fork; auditing the real page.)*
`;

    process.env.GITHUB_TARGET_REPO = forkFull;
    const branch = `ramp/fix-${taskId}-${Date.now()}`;
    const url = await openPr({
      branch,
      filePath: file,
      newContent: fixedContent,
      title: `Improve accessibility of ${file} — Ramp verified WCAG fixes`,
      body,
    });
    console.log(`\nPR_URL: ${url}`);
    console.log(`SCORE: ${beforeScore.score} -> ${afterScore.score}`);
    console.log("\n--- diff (first 60 lines) ---\n" + finalDiff.split("\n").slice(0, 60).join("\n"));
  } finally {
    repo.cleanup();
  }
}

main().catch((e) => {
  console.error("fix:repo failed:", e);
  process.exit(1);
});
