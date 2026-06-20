/**
 * Curate benchmark tasks from mined PR candidates.
 *
 * For each row in data/candidates.jsonl:
 *  1. Shallow-clone the repo at base_commit (pre-fix)
 *  2. Ask OpenAI to produce a BenchTask from the unified diff
 *  3. Write data/tasks/<id>.json with stratified type coverage
 *
 * Usage:
 *   pnpm --filter @ramp/bench curate
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { AnnotatedFinding, BenchTask, ViolationType } from "@ramp/shared";
import type { CandidateRow } from "./mine.js";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const CANDIDATES_PATH = join(DATA_DIR, "candidates.jsonl");
const SEEDS_PATH = join(DATA_DIR, "seeds.txt");
const TASKS_DIR = join(DATA_DIR, "tasks");

const VIOLATION_TYPES: ViolationType[] = [
  "missing_alt_text",
  "missing_form_labels",
  "icon_button_accessible_names",
  "low_color_contrast",
  "heading_structure",
  "missing_landmarks",
  "missing_focus_indicator",
  "keyboard_navigation",
];

const TYPE_CAPS: Record<ViolationType, number> = {
  missing_alt_text: 6,
  missing_form_labels: 5,
  icon_button_accessible_names: 5,
  low_color_contrast: 5,
  heading_structure: 4,
  missing_landmarks: 4,
  missing_focus_indicator: 4,
  keyboard_navigation: 4,
};

const TARGET_TASKS = Number(process.env.CURATE_TARGET ?? 25);
const CONCURRENCY = Number(process.env.CURATE_CONCURRENCY ?? 4);
const MODEL = process.env.CURATE_MODEL ?? "gpt-4o-mini";
const MAX_DIFF_CHARS = Number(process.env.CURATE_MAX_DIFF_CHARS ?? 24_000);
const MAX_DIFF_FILES = Number(process.env.CURATE_MAX_DIFF_FILES ?? 8);
const MAX_FINDINGS_PER_TASK = Number(process.env.CURATE_MAX_FINDINGS_PER_TASK ?? 3);

export interface BenchTaskRecord extends BenchTask {
  baseCommit: string;
  fixCommit: string;
  sourcePr: { repo: string; pr_number: number; title: string };
}

interface LlmBenchTaskPayload {
  framework?: string;
  branch?: string;
  expectedFindings?: Array<{
    type?: string;
    wcagRule?: string;
    file?: string;
    line?: number;
    expectedFix?: string;
  }>;
}

const A11Y_DIFF =
  /aria-|alt\s*text|alt=|role=|wcag|contrast|label|landmark|tabindex|focus-visible|screen.?reader|accessible/i;

function loadSeeds(): Set<string> {
  if (!existsSync(SEEDS_PATH)) return new Set();
  const seeds = new Set<string>();
  for (const line of readFileSync(SEEDS_PATH, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) seeds.add(trimmed);
  }
  return seeds;
}

function loadCandidates(): CandidateRow[] {
  if (!existsSync(CANDIDATES_PATH)) {
    throw new Error(`Missing ${CANDIDATES_PATH}. Run pnpm --filter @ramp/bench mine first.`);
  }

  const seen = new Set<string>();
  const rows: CandidateRow[] = [];
  for (const line of readFileSync(CANDIDATES_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as CandidateRow;
    const key = `${row.repo}#${row.pr_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

function countDiffFiles(diff: string): number {
  return (diff.match(/^diff --git /gm) ?? []).length;
}

function rankCandidates(rows: CandidateRow[], seeds: Set<string>): CandidateRow[] {
  return [...rows].sort((a, b) => scoreCandidate(b, seeds) - scoreCandidate(a, seeds));
}

function scoreCandidate(row: CandidateRow, seeds: Set<string>): number {
  const key = `${row.repo}#${row.pr_number}`;
  const files = countDiffFiles(row.diff);
  const a11yHits = (row.diff.match(A11Y_DIFF) ?? []).length;
  const isSeed = seeds.has(key) ? 1 : 0;
  const smallDiff = row.diff.length <= 12_000 ? 1 : 0;
  const fewFiles = files <= 3 ? 2 : files <= 5 ? 1 : 0;
  return isSeed * 100 + fewFiles * 10 + smallDiff * 5 + a11yHits;
}

function passesPrefilter(row: CandidateRow): boolean {
  if (!A11Y_DIFF.test(row.diff)) return false;
  if (row.diff.length > MAX_DIFF_CHARS) return false;
  if (countDiffFiles(row.diff) > MAX_DIFF_FILES) return false;
  return true;
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

async function shallowCheckout(
  repo: string,
  commit: string,
): Promise<{ repoPath: string; framework: string }> {
  const token = process.env.GITHUB_TOKEN;
  const authPrefix = token ? `https://x-access-token:${token}@github.com/` : "https://github.com/";
  const repoUrl = `${authPrefix}${repo}.git`;
  const repoPath = join(
    tmpdir(),
    `ramp-curate-${repo.replace("/", "-")}-${commit.slice(0, 8)}-${randomUUID()}`,
  );

  rmSync(repoPath, { recursive: true, force: true });
  mkdirSync(repoPath, { recursive: true });

  await runGit(repoPath, ["init"]);
  await runGit(repoPath, ["remote", "add", "origin", repoUrl]);
  await runGit(repoPath, ["fetch", "--depth", "1", "origin", commit]);
  await runGit(repoPath, ["checkout", "FETCH_HEAD"]);

  const framework = detectFramework(repoPath);
  return { repoPath, framework };
}

function detectFramework(repoPath: string): string {
  const pkgPath = join(repoPath, "package.json");
  if (!existsSync(pkgPath)) return "unknown";

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.next) return "next";
    if (deps.nuxt) return "nuxt";
    if (deps.react) return "react";
    if (deps.vue) return "vue";
    if (deps["@angular/core"]) return "angular";
    if (deps.svelte) return "svelte";
    return "javascript";
  } catch {
    return "unknown";
  }
}

function nextTaskId(): string {
  mkdirSync(TASKS_DIR, { recursive: true });
  const existing = readdirSync(TASKS_DIR)
    .map((name) => /^ramp-(\d+)\.json$/.exec(name)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `ramp-${String(next).padStart(3, "0")}`;
}

function validateFinding(raw: NonNullable<LlmBenchTaskPayload["expectedFindings"]>[number]): AnnotatedFinding | null {
  if (!raw.type || !VIOLATION_TYPES.includes(raw.type as ViolationType)) return null;
  if (!raw.wcagRule || !raw.file) return null;

  return {
    type: raw.type as ViolationType,
    wcagRule: raw.wcagRule,
    file: raw.file.replace(/^\.\//, ""),
    ...(typeof raw.line === "number" ? { line: raw.line } : {}),
    ...(raw.expectedFix ? { expectedFix: raw.expectedFix } : {}),
  };
}

async function generateBenchTaskPayload(
  candidate: CandidateRow,
  framework: string,
): Promise<LlmBenchTaskPayload | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Add it to the repo root .env file.");
  }

  const system = `You create accessibility benchmark ground-truth annotations from merged PR diffs.

Return JSON with:
{
  "framework": "react" | "vue" | "next" | "angular" | "svelte" | "javascript" | "unknown",
  "branch": optional default branch name,
  "expectedFindings": [
    {
      "type": one of ${JSON.stringify(VIOLATION_TYPES)},
      "wcagRule": "e.g. 1.1.1",
      "file": "repo-relative path from the diff",
      "line": optional line number in the BEFORE file,
      "expectedFix": "short description of the repair in the PR"
    }
  ]
}

Rules:
- One finding per distinct accessibility fix hunk in the diff.
- "file" must match a path shown in the diff and use the repo-relative path (same convention as sourceFile in audit findings).
- Only use ViolationType values from the allowed list.
- Skip non-accessibility changes (refactors, deps, unrelated features).
- If the diff has no real accessibility fixes, return {"expectedFindings": []}.`;

  const user = `PR: ${candidate.repo}#${candidate.pr_number}
Title: ${candidate.title}
Detected framework hint: ${framework}

Unified diff:
${candidate.diff.slice(0, MAX_DIFF_CHARS)}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  return JSON.parse(content) as LlmBenchTaskPayload;
}

function buildTaskRecord(
  candidate: CandidateRow,
  payload: LlmBenchTaskPayload,
  frameworkHint: string,
  id: string,
): BenchTaskRecord | null {
  const findings = (payload.expectedFindings ?? [])
    .map(validateFinding)
    .filter((finding): finding is AnnotatedFinding => finding !== null);

  if (findings.length === 0) return null;

  return {
    id,
    repoUrl: `https://github.com/${candidate.repo}`,
    ...(payload.branch ? { branch: payload.branch } : {}),
    framework: payload.framework ?? frameworkHint,
    expectedFindings: findings,
    createdAt: new Date().toISOString(),
    baseCommit: candidate.base_commit,
    fixCommit: candidate.fix_commit,
    sourcePr: {
      repo: candidate.repo,
      pr_number: candidate.pr_number,
      title: candidate.title,
    },
  };
}

function typeCountsFromTasks(tasks: BenchTaskRecord[]): Record<ViolationType, number> {
  const counts = Object.fromEntries(
    VIOLATION_TYPES.map((type) => [type, 0]),
  ) as Record<ViolationType, number>;

  for (const task of tasks) {
    for (const finding of task.expectedFindings) {
      counts[finding.type]++;
    }
  }
  return counts;
}

function trimFindingsForQuota(
  findings: AnnotatedFinding[],
  counts: Record<ViolationType, number>,
): AnnotatedFinding[] {
  const sorted = [...findings].sort((a, b) => {
    const roomA = TYPE_CAPS[a.type] - (counts[a.type] ?? 0);
    const roomB = TYPE_CAPS[b.type] - (counts[b.type] ?? 0);
    return roomB - roomA;
  });

  const kept: AnnotatedFinding[] = [];
  const projected = { ...counts };

  for (const finding of sorted) {
    if (kept.length >= MAX_FINDINGS_PER_TASK) break;
    projected[finding.type] = (projected[finding.type] ?? 0) + 1;
    if (projected[finding.type] > TYPE_CAPS[finding.type]) {
      continue;
    }
    kept.push(finding);
  }

  return kept;
}

function canAcceptTask(
  findings: AnnotatedFinding[],
  counts: Record<ViolationType, number>,
): boolean {
  const projected = { ...counts };
  for (const finding of findings) {
    projected[finding.type]++;
    if (projected[finding.type] > TYPE_CAPS[finding.type]) {
      return false;
    }
  }
  return findings.length > 0;
}

function acceptTask(
  findings: AnnotatedFinding[],
  counts: Record<ViolationType, number>,
): void {
  for (const finding of findings) {
    counts[finding.type]++;
  }
}

async function curateCandidate(candidate: CandidateRow): Promise<BenchTaskRecord | null> {
  let repoPath: string | undefined;
  try {
    const checkout = await shallowCheckout(candidate.repo, candidate.base_commit);
    repoPath = checkout.repoPath;
    const payload = await generateBenchTaskPayload(candidate, checkout.framework);
    if (!payload) return null;
    return buildTaskRecord(candidate, payload, checkout.framework, "pending");
  } catch (error) {
    console.warn(
      `[curate] skip ${candidate.repo}#${candidate.pr_number}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  } finally {
    if (repoPath) rmSync(repoPath, { recursive: true, force: true });
  }
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  async function runWorker(): Promise<void> {
    while (index < items.length) {
      const current = index++;
      await worker(items[current]!);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
}

function printDistribution(tasks: BenchTaskRecord[]): void {
  const counts = typeCountsFromTasks(tasks);
  console.log("\n[curate] type distribution:");
  for (const type of VIOLATION_TYPES) {
    console.log(`  ${type}: ${counts[type]}`);
  }
}

export async function curateTasks(): Promise<{
  written: number;
  skipped: number;
  tasks: BenchTaskRecord[];
}> {
  mkdirSync(TASKS_DIR, { recursive: true });
  const seeds = loadSeeds();
  const candidates = rankCandidates(loadCandidates(), seeds).filter(passesPrefilter);

  console.log(`[curate] ${candidates.length} candidates after prefilter`);
  console.log(`[curate] target ${TARGET_TASKS} tasks, model ${MODEL}`);

  const accepted: BenchTaskRecord[] = [];
  const typeCounts = Object.fromEntries(
    VIOLATION_TYPES.map((type) => [type, 0]),
  ) as Record<ViolationType, number>;
  let skipped = 0;
  let stop = false;
  let lock = Promise.resolve();

  const withLock = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    const run = lock.then(fn);
    lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const queue = [...candidates];

  await runPool(queue, CONCURRENCY, async (candidate) => {
    if (stop) return;

    const draft = await curateCandidate(candidate);
    if (!draft) {
      await withLock(() => {
        skipped++;
      });
      return;
    }

    await withLock(() => {
      if (stop || accepted.length >= TARGET_TASKS) {
        skipped++;
        return;
      }

      const findings = trimFindingsForQuota(draft.expectedFindings, typeCounts);
      if (!canAcceptTask(findings, typeCounts)) {
        skipped++;
        console.log(
          `[curate] ~ ${candidate.repo}#${candidate.pr_number} (type cap reached)`,
        );
        return;
      }

      draft.id = nextTaskId();
      draft.expectedFindings = findings;
      acceptTask(findings, typeCounts);
      accepted.push(draft);
      writeFileSync(
        join(TASKS_DIR, `${draft.id}.json`),
        `${JSON.stringify(draft, null, 2)}\n`,
        "utf8",
      );
      console.log(
        `[curate] + ${draft.id} ${candidate.repo}#${candidate.pr_number} (${draft.expectedFindings.length} findings)`,
      );

      if (accepted.length >= TARGET_TASKS) {
        stop = true;
      }
    });
  });

  printDistribution(accepted);
  return { written: accepted.length, skipped, tasks: accepted };
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  curateTasks()
    .then(({ written, skipped, tasks }) => {
      console.log("\n[curate] done");
      console.log(`  tasks written : ${written}`);
      console.log(`  skipped       : ${skipped}`);
      console.log(`  output dir    : ${TASKS_DIR}`);
      if (tasks.length > 0) {
        console.log("\n[curate] sample tasks:");
        for (const task of tasks.slice(0, 3)) {
          console.log(
            `  ${task.id} ${task.sourcePr.repo}#${task.sourcePr.pr_number}`,
          );
          for (const finding of task.expectedFindings) {
            console.log(
              `    - ${finding.type} ${finding.wcagRule} ${finding.file}`,
            );
          }
        }
      }
    })
    .catch((error) => {
      console.error("[curate] failed:", error);
      process.exit(1);
    });
}
