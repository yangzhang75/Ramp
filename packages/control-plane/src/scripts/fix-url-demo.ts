/**
 * Generic, BYO-credentials fix loop: any user, any static-HTML GitHub repo.
 *
 *   REPO_URL=https://github.com/owner/repo [FILE=path/to/page.html] \
 *     OPENAI_API_KEY=... GITHUB_TOKEN=... \
 *     pnpm --filter @ramp/control-plane fix:url
 *
 * Flow (entry layer only — reuses the existing engine):
 *   GET /user (whoami) → fork to THAT account → locate the HTML file →
 *   prepareRepo (current HEAD) → axe baseline + score → runAudit (gpt-4o-mini) →
 *   fixOneFinding (Claude Code) + verifyFix → axe after + score → openPr on the
 *   user's fork.
 *
 * Static HTML only. Repos that need a build (React/Vue/etc.) are refused early.
 * Does NOT touch the TASK_ID fix:repo flow. Anthropic API key is NOT used.
 */
import "../instrument.js"; // MUST be first — initializes Sentry
import * as Sentry from "@sentry/node";
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
import { verifyFix } from "../verify.js";

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
  "select-name": "serious",
  "color-contrast": "serious",
  "landmark-one-main": "moderate",
  region: "moderate",
  "heading-order": "moderate",
};
const RULE_TO_TYPE: Record<string, ViolationType> = {
  "image-alt": "missing_alt_text",
  "button-name": "icon_button_accessible_names",
  label: "missing_form_labels",
  "select-name": "missing_form_labels",
  "color-contrast": "low_color_contrast",
  "landmark-one-main": "missing_landmarks",
  region: "missing_landmarks",
  "heading-order": "heading_structure",
};
const FRAMEWORK_DEPS = [
  "react", "react-dom", "vue", "svelte", "@angular/core", "next", "nuxt",
  "vite", "webpack", "parcel", "@sveltejs/kit", "astro", "gatsby",
];

async function gh(method: string, path: string, body?: unknown) {
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
  return { status: res.status, json: text ? JSON.parse(text) : ({} as any) };
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseRepoUrl(url: string): { owner: string; name: string } {
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?\/?$/i);
  if (!m) throw new Error(`REPO_URL must be a GitHub repo URL, got: ${url}`);
  return { owner: m[1]!, name: m[2]! };
}

/** Refuse repos that need a build step (we only audit static HTML). */
async function assertStaticHtml(owner: string, name: string, ref: string): Promise<void> {
  const pkg = await gh("GET", `/repos/${owner}/${name}/contents/package.json?ref=${ref}`);
  if (pkg.status !== 200 || !pkg.json.content) return; // no package.json → static
  const json = JSON.parse(Buffer.from(pkg.json.content, "base64").toString("utf8"));
  const deps = { ...(json.dependencies ?? {}), ...(json.devDependencies ?? {}) };
  const hitDep = FRAMEWORK_DEPS.find((d) => d in deps);
  const hasBuild = Boolean(json.scripts?.build);
  if (hitDep || hasBuild) {
    throw new Error(
      `暂不支持构建型框架 — detected ${hitDep ? `dependency "${hitDep}"` : `a "build" script`} in package.json. ` +
        `This tool only handles static HTML. (Build-type framework support is a next step.)`,
    );
  }
}

/** Locate the HTML file to audit (root index.html → first root .html → error). */
async function locateHtml(owner: string, name: string, ref: string): Promise<string> {
  if (process.env.FILE) return process.env.FILE;
  const root = await gh("GET", `/repos/${owner}/${name}/contents?ref=${ref}`);
  if (root.status !== 200 || !Array.isArray(root.json)) {
    throw new Error(`Could not list repo root; set FILE=path/to/page.html explicitly.`);
  }
  const files = root.json.filter((e: any) => e.type === "file");
  const index = files.find((e: any) => /^index\.html?$/i.test(e.name));
  if (index) return index.path;
  const firstHtml = files.find((e: any) => /\.html?$/i.test(e.name));
  if (firstHtml) return firstHtml.path;
  throw new Error(
    `No HTML file found in the repo root. Re-run with FILE=path/to/page.html to point at the page to audit.`,
  );
}

async function main(): Promise<void> {
  const repoUrl = process.env.REPO_URL;
  if (!repoUrl) throw new Error("REPO_URL required (e.g. https://github.com/owner/repo)");
  if (!TOKEN) throw new Error("GITHUB_TOKEN required");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required");
  process.env.RAMP_AUDIT_PROVIDER = "openai";
  process.env.RAMP_AUDIT_MODEL = "gpt-4o-mini";

  const { owner, name } = parseRepoUrl(repoUrl);

  // 1. Whoami (the fork target — never hardcoded).
  const who = await gh("GET", "/user");
  if (who.status !== 200 || !who.json.login) {
    throw new Error(`GitHub token invalid (GET /user → ${who.status}). Check GITHUB_TOKEN.`);
  }
  const me = who.json.login as string;

  // 2. Upstream info + static-only guard + file location (fail fast, pre-fork).
  const up = await gh("GET", `/repos/${owner}/${name}`);
  if (up.status !== 200) throw new Error(`Repo not found / not accessible: ${owner}/${name} (${up.status})`);
  const defaultBranch = up.json.default_branch as string;
  await assertStaticHtml(owner, name, defaultBranch);
  const file = await locateHtml(owner, name, defaultBranch);
  console.log(`[fix:url] ${owner}/${name}@${defaultBranch} | user=${me} | file=${file}`);

  // 3. Fork to the token owner's account.
  const fork = await gh("POST", `/repos/${owner}/${name}/forks`, {});
  if (fork.status >= 400) throw new Error(`Fork failed (${fork.status}): ${fork.json.message}`);
  const forkFull = (fork.json.full_name as string) ?? `${me}/${name}`;
  const forkBranch = (fork.json.default_branch as string) ?? defaultBranch;
  console.log(`[fix:url] forked → ${forkFull}`);
  for (let i = 0; i < 30; i++) {
    const r = await gh("GET", `/repos/${forkFull}/contents/${file}?ref=${forkBranch}`);
    if (r.status === 200) break;
    await sleep(2000);
  }

  // 4. Sandbox checkout of the upstream current HEAD, then the loop.
  const repo = await prepareRepo(repoUrl, defaultBranch);
  const target = join(repo.workdir, file);

  await Sentry.startSpan(
    { name: "ramp.fix-url", op: "ramp.fixloop", attributes: { repo: `${owner}/${name}`, file, user: me } },
    async (root) => {
      try {
        const beforeAxe = await Sentry.startSpan(
          { name: "audit: axe baseline", op: "ramp.audit" },
          () => axeScan(target),
        );
        const beforeRuleIds = beforeAxe.map((v) => v.id);
        const beforeSR = await screenReader(target);
        const beforeScore = computeScore(axeToFindings(beforeAxe, "before"));
        console.log(`[fix:url] before: score ${beforeScore.score}, axe=[${beforeRuleIds.join(",")}]`);

        const findings = await Sentry.startSpan(
          { name: "audit: runAudit (gpt-4o-mini)", op: "ramp.audit.llm" },
          () => runAudit({ url: target, runId: "fix-url", maxSteps: 15 }),
        );
        const toFix = findings.filter((f) => FIXABLE.includes(f.type)).slice(0, 4);
        console.log(`[fix:url] audit found ${findings.length}; fixing ${toFix.length}: ${toFix.map((f) => f.type).join(", ")}`);

        const fixResults = [];
        for (const f of toFix) {
          f.sourceFile = file;
          const attempt = await Sentry.startSpan(
            { name: `fix: ${f.type}`, op: "ramp.fix.claude_code", attributes: { "finding.type": f.type } },
            () => fixOneFinding(repo.workdir, f),
          );
          const v = await Sentry.startSpan(
            { name: `verify: ${f.type}`, op: "ramp.verify.axe" },
            () =>
              verifyFix({
                runId: "fix-url",
                findingId: f.id,
                type: f.type,
                file,
                diff: attempt.diff,
                strategy: attempt.strategy,
                targetUrl: target,
                beforeRuleIds,
              }),
          );
          fixResults.push({ finding: f, result: v.result });
          console.log(`[fix:url]   ${f.type}: ${v.result.status}`);
        }

        const afterAxe = await Sentry.startSpan(
          { name: "verify: axe after", op: "ramp.verify.axe" },
          () => axeScan(target),
        );
        const afterSR = await screenReader(target);
        const afterScore = computeScore(axeToFindings(afterAxe, "after"));
        const fixedContent = readFileSync(target, "utf8");
        console.log(`[fix:url] after: score ${afterScore.score}, axe=[${afterAxe.map((v) => v.id).join(",")}]`);

        const axeLine = (a: AxeViolationSummary[]) =>
          a.length ? a.map((v) => `\`${v.id}\`(${v.impact})`).join(", ") : "**none** 🎉";
        const srBlock = (s: string[]) => "```\n" + s.slice(0, 16).join("\n") + "\n```";
        const body = `## What Ramp did

Ramp audited \`${file}\` (real page from [${owner}/${name}](${repoUrl})), repaired the high-confidence WCAG violations, and **verified each fix with axe-core**. Audit model: \`gpt-4o-mini\`; fix by Claude Code; verified by axe.

## Compliance score: ${beforeScore.score} → ${afterScore.score} (+${afterScore.score - beforeScore.score})

## Fixed
${toFix.map((f) => `- **${f.type.replace(/_/g, " ")}** (${f.wcagRule})`).join("\n") || "_(no auto-fixable findings)_"}

## axe-core: before vs after
- **before:** ${axeLine(beforeAxe)}
- **after:** ${axeLine(afterAxe)}

## Screen reader: before vs after
**Before** ${srBlock(beforeSR)}
**After** ${srBlock(afterSR)}

---
🤖 Generated by [Ramp](https://github.com/yangzhang75/Ramp) — accessibility audit → fix → verify → PR. *(Demo PR on your fork.)*
`;

        process.env.GITHUB_TARGET_REPO = forkFull;
        const branch = `ramp/fix-${Date.now()}`;
        const url = await Sentry.startSpan(
          { name: "open pull request", op: "ramp.pr.github" },
          () =>
            openPr({
              branch,
              filePath: file,
              newContent: fixedContent,
              title: `Improve accessibility of ${file} — Ramp verified WCAG fixes`,
              body,
            }),
        );
        root.setAttribute("score.before", beforeScore.score);
        root.setAttribute("score.after", afterScore.score);
        root.setAttribute("pr.url", url);
        console.log(`\nPR_URL: ${url}`);
        console.log(`SCORE: ${beforeScore.score} -> ${afterScore.score}`);
      } finally {
        repo.cleanup();
      }
    },
  );
}

main()
  .catch(async (e) => {
    console.error("fix:url failed:", e instanceof Error ? e.message : e);
    Sentry.captureException(e);
    await Sentry.flush(3000);
    process.exit(1);
  })
  .then(async () => {
    await Sentry.flush(3000);
  });
