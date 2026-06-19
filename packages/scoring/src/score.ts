/**
 * Benchmark detection scoring: naked model vs full harness.
 *
 * Usage:
 *   pnpm --filter @ramp/scoring score
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
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { runAudit } from "@ramp/harness";
import type { AnnotatedFinding, BenchTask, Finding } from "@ramp/shared";
import { getDb } from "@ramp/shared";
import { findings, runs, scores } from "@ramp/shared/db";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(__dirname, "../../bench/data/tasks");

const SCORE_LIMIT = Number(process.env.SCORE_LIMIT ?? 0);
const VIOLATION_TYPES = [
  "missing_alt_text",
  "missing_form_labels",
  "icon_button_accessible_names",
  "low_color_contrast",
  "heading_structure",
  "missing_landmarks",
  "missing_focus_indicator",
  "keyboard_navigation",
] as const;

export interface BenchTaskRecord extends BenchTask {
  baseCommit: string;
  fixCommit: string;
  sourcePr: { repo: string; pr_number: number; title: string };
}

export interface DetectionMetrics {
  mode: "naked" | "harness";
  tasks: number;
  expected: number;
  truePositives: number;
  detected: number;
  recall: number;
  precision: number;
}

interface SourceBundle {
  path: string;
  content: string;
}

interface AuditContext {
  targetUrl: string;
  hints: string;
  cleanupPaths: string[];
}

function ensureSchema(db: ReturnType<typeof getDb>): void {
  db.$client.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      repo_url TEXT NOT NULL,
      branch TEXT,
      target_url TEXT,
      framework TEXT,
      package_manager TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      bench_task_id TEXT,
      pull_request_url TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      wcag_rule TEXT NOT NULL,
      dom_node TEXT,
      page TEXT,
      source_file TEXT,
      line INTEGER,
      confidence REAL NOT NULL,
      auto_fixable INTEGER NOT NULL,
      evidence TEXT
    );
    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      score REAL NOT NULL,
      critical INTEGER NOT NULL DEFAULT 0,
      serious INTEGER NOT NULL DEFAULT 0,
      moderate INTEGER NOT NULL DEFAULT 0,
      minor INTEGER NOT NULL DEFAULT 0,
      total_violations INTEGER NOT NULL DEFAULT 0,
      computed_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);
}

function loadBenchTaskRecords(): BenchTaskRecord[] {
  if (!existsSync(TASKS_DIR)) return [];
  return readdirSync(TASKS_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const raw = readFileSync(join(TASKS_DIR, name), "utf8");
      return JSON.parse(raw) as BenchTaskRecord;
    });
}

function parseRepoUrl(repoUrl: string): string {
  const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
  if (!match) throw new Error(`Unsupported repo URL: ${repoUrl}`);
  return match[1]!;
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout.trim();
}

async function cloneTaskRepo(task: BenchTaskRecord): Promise<string> {
  const repo = parseRepoUrl(task.repoUrl);
  const token = process.env.GITHUB_TOKEN;
  const authPrefix = token
    ? `https://x-access-token:${token}@github.com/`
    : "https://github.com/";
  const repoUrl = `${authPrefix}${repo}.git`;
  const repoPath = join(
    tmpdir(),
    `ramp-score-${task.id}-${randomUUID().slice(0, 8)}`,
  );

  mkdirSync(repoPath, { recursive: true });
  await runGit(repoPath, ["init"]);
  await runGit(repoPath, ["remote", "add", "origin", repoUrl]);
  await runGit(repoPath, ["fetch", "--depth", "1", "origin", task.baseCommit]);
  await runGit(repoPath, ["checkout", "FETCH_HEAD"]);
  return repoPath;
}

function readSourceWindow(
  repoPath: string,
  file: string,
  line?: number,
): string {
  const fullPath = join(repoPath, file);
  if (!existsSync(fullPath)) {
    return `(missing file: ${file})`;
  }
  const content = readFileSync(fullPath, "utf8");
  if (!line) return content;
  const lines = content.split("\n");
  const start = Math.max(0, line - 25);
  const end = Math.min(lines.length, line + 25);
  return lines.slice(start, end).join("\n");
}

function collectSourceBundles(task: BenchTaskRecord, repoPath: string): SourceBundle[] {
  const seen = new Set<string>();
  const bundles: SourceBundle[] = [];

  for (const finding of task.expectedFindings) {
    if (seen.has(finding.file)) continue;
    seen.add(finding.file);
    bundles.push({
      path: finding.file,
      content: readSourceWindow(repoPath, finding.file, finding.line),
    });
  }
  return bundles;
}

function writeTempHtml(taskId: string, body: string, css?: string): string {
  const path = join(tmpdir(), `ramp-score-page-${taskId}-${randomUUID()}.html`);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  ${css ? `<style>${css}</style>` : ""}
</head>
<body>
${body}
</body>
</html>`;
  writeFileSync(path, html, "utf8");
  return path;
}

function buildAuditContext(
  task: BenchTaskRecord,
  repoPath: string,
): AuditContext {
  const bundles = collectSourceBundles(task, repoPath);
  const cleanupPaths: string[] = [];
  const htmlFile = bundles.find((bundle) => bundle.path.endsWith(".html"));

  let targetUrl: string;
  if (htmlFile) {
    targetUrl = resolve(repoPath, htmlFile.path);
  } else {
    const cssBundle = bundles.find((bundle) => bundle.path.endsWith(".css"));
    const markupBundles = bundles.filter(
      (bundle) => !bundle.path.endsWith(".css"),
    );
    const body = markupBundles
      .map(
        (bundle) =>
          `<section data-source-file="${bundle.path}"><pre>${escapeHtml(bundle.content)}</pre></section>`,
      )
      .join("\n");
    const tempHtml = writeTempHtml(
      task.id,
      body || "<p>Benchmark audit page</p>",
      cssBundle?.content,
    );
    cleanupPaths.push(tempHtml);
    targetUrl = tempHtml;
  }

  const hints =
    `Benchmark task ${task.id}. When calling submit_finding, set sourceFile to the exact repo-relative path below.\n` +
    bundles
      .map((bundle) => `FILE: ${bundle.path}\n${bundle.content}`)
      .join("\n\n");

  return { targetUrl, hints, cleanupPaths };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeWcagRule(rule: string): string {
  return rule.trim().split(/\s+/)[0]?.replace(/[^\d.]/g, "") ?? rule.trim();
}

function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replace(/\\/g, "/");
}

function pathsMatch(expectedFile: string, sourceFile?: string): boolean {
  if (!sourceFile) return false;
  const a = normalizePath(expectedFile);
  const b = normalizePath(sourceFile);
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

export function matchFinding(
  expected: AnnotatedFinding,
  finding: Finding,
): boolean {
  return (
    finding.type === expected.type &&
    normalizeWcagRule(finding.wcagRule) === normalizeWcagRule(expected.wcagRule) &&
    pathsMatch(expected.file, finding.sourceFile)
  );
}

export function gradeDetection(
  expected: AnnotatedFinding[],
  detected: Finding[],
): { truePositives: number; recall: number; precision: number } {
  let truePositives = 0;
  const matchedDetected = new Set<string>();

  for (const exp of expected) {
    const hit = detected.find(
      (finding) =>
        !matchedDetected.has(finding.id) && matchFinding(exp, finding),
    );
    if (hit) {
      truePositives++;
      matchedDetected.add(hit.id);
    }
  }

  const recall = expected.length === 0 ? 0 : truePositives / expected.length;
  const precision =
    detected.length === 0 ? 0 : truePositives / detected.length;

  return { truePositives, recall, precision };
}

const nakedSchema = z.object({
  findings: z.array(
    z.object({
      type: z.enum(VIOLATION_TYPES),
      wcagRule: z.string(),
      sourceFile: z.string(),
      line: z.number().int().optional(),
      severity: z
        .enum(["critical", "serious", "moderate", "minor"])
        .default("serious"),
      evidence: z.string().optional(),
      confidence: z.number().min(0).max(1).default(0.6),
      autoFixable: z.boolean().default(true),
    }),
  ),
});

function resolveAuditModel(): LanguageModel {
  const provider =
    process.env.RAMP_AUDIT_PROVIDER ??
    (process.env.ANTHROPIC_API_KEY
      ? "anthropic"
      : process.env.OPENAI_API_KEY
        ? "openai"
        : "anthropic");
  const modelName =
    process.env.RAMP_AUDIT_MODEL ??
    (provider === "openai" ? "gpt-4o-mini" : "claude-sonnet-4-6");

  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    return openai(modelName);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return anthropic(modelName);
}

async function runNakedAudit(
  task: BenchTaskRecord,
  context: AuditContext,
  runId: string,
): Promise<Finding[]> {
  const model = resolveAuditModel();
  const html = readFileSync(context.targetUrl, "utf8");

  const { object } = await generateObject({
    model,
    schema: nakedSchema,
    system: `You are a WCAG accessibility auditor. You only receive HTML/source context — no tools.
List every accessibility violation you can justify from the markup/source.
Use exact ViolationType values and set sourceFile to the repo-relative path provided in the context.`,
    prompt:
      `Task ${task.id}\n` +
      `Primary HTML:\n${html}\n\n` +
      `Source context:\n${context.hints}\n\n` +
      `Return JSON findings only.`,
  });

  return object.findings.map((finding, index) => ({
    id: `${runId}-f${index + 1}`,
    runId,
    type: finding.type,
    severity: finding.severity,
    wcagRule: finding.wcagRule,
    sourceFile: finding.sourceFile,
    line: finding.line,
    confidence: finding.confidence,
    autoFixable: finding.autoFixable,
    evidence: finding.evidence,
    page: context.targetUrl,
  }));
}

async function runHarnessAudit(
  task: BenchTaskRecord,
  context: AuditContext,
  runId: string,
): Promise<Finding[]> {
  return runAudit({
    url: context.targetUrl,
    hints: context.hints,
    runId,
    maxSteps: 20,
  });
}

function aggregateMetrics(
  mode: "naked" | "harness",
  perTask: Array<{ expected: number; truePositives: number; detected: number }>,
): DetectionMetrics {
  const expected = perTask.reduce((sum, row) => sum + row.expected, 0);
  const truePositives = perTask.reduce((sum, row) => sum + row.truePositives, 0);
  const detected = perTask.reduce((sum, row) => sum + row.detected, 0);

  return {
    mode,
    tasks: perTask.length,
    expected,
    truePositives,
    detected,
    recall: expected === 0 ? 0 : truePositives / expected,
    precision: detected === 0 ? 0 : truePositives / detected,
  };
}

function persistRun(
  db: ReturnType<typeof getDb>,
  runId: string,
  repoUrl: string,
  benchTaskId: string,
  framework?: string,
): void {
  db.insert(runs)
    .values({
      id: runId,
      repoUrl,
      framework,
      benchTaskId,
      status: "scoring",
    })
    .onConflictDoNothing()
    .run();
}

function persistFindings(db: ReturnType<typeof getDb>, items: Finding[]): void {
  if (items.length === 0) return;
  db.insert(findings)
    .values(
      items.map((finding) => ({
        id: finding.id,
        runId: finding.runId,
        type: finding.type,
        severity: finding.severity,
        wcagRule: finding.wcagRule,
        domNode: finding.domNode,
        page: finding.page,
        sourceFile: finding.sourceFile,
        line: finding.line,
        confidence: finding.confidence,
        autoFixable: finding.autoFixable,
        evidence: finding.evidence,
      })),
    )
    .run();
}

function persistAggregateScore(
  db: ReturnType<typeof getDb>,
  runId: string,
  metrics: DetectionMetrics,
): void {
  db.insert(scores)
    .values({
      id: `${runId}-before`,
      runId,
      phase: "before",
      score: Math.round(metrics.recall * 1000) / 10,
      critical: metrics.expected,
      serious: metrics.truePositives,
      moderate: Math.round(metrics.precision * 1000) / 10,
      minor: Math.max(0, metrics.detected - metrics.truePositives),
      totalViolations: metrics.detected,
    })
    .run();
}

export async function scoreBenchmark(): Promise<{
  naked: DetectionMetrics;
  harness: DetectionMetrics;
}> {
  const db = getDb();
  ensureSchema(db);

  const tasks = loadBenchTaskRecords();
  const limited =
    SCORE_LIMIT > 0 ? tasks.slice(0, SCORE_LIMIT) : tasks;

  console.log(`[score] running ${limited.length}/${tasks.length} tasks`);

  const nakedRows: Array<{
    expected: number;
    truePositives: number;
    detected: number;
  }> = [];
  const harnessRows: Array<{
    expected: number;
    truePositives: number;
    detected: number;
  }> = [];

  const batchId = Date.now();

  const nakedAggregateRunId = `bench-naked-${batchId}`;
  const harnessAggregateRunId = `bench-harness-${batchId}`;
  persistRun(db, nakedAggregateRunId, "benchmark://detection", "aggregate");
  persistRun(db, harnessAggregateRunId, "benchmark://detection", "aggregate");

  for (const task of limited) {
    console.log(`[score] ${task.id} ${task.sourcePr.repo}#${task.sourcePr.pr_number}`);
    let repoPath: string | undefined;
    let cleanupPaths: string[] = [];

    try {
      repoPath = await cloneTaskRepo(task);
      const context = buildAuditContext(task, repoPath);
      cleanupPaths = context.cleanupPaths;

      const nakedRunId = `${task.id}-naked-${batchId}`;
      const harnessRunId = `${task.id}-harness-${batchId}`;
      persistRun(db, nakedRunId, task.repoUrl, task.id, task.framework);
      persistRun(db, harnessRunId, task.repoUrl, task.id, task.framework);

      const nakedFindings = await runNakedAudit(task, context, nakedRunId);
      persistFindings(db, nakedFindings);
      const nakedGrade = gradeDetection(task.expectedFindings, nakedFindings);
      nakedRows.push({
        expected: task.expectedFindings.length,
        truePositives: nakedGrade.truePositives,
        detected: nakedFindings.length,
      });
      console.log(
        `[score]   naked   recall ${(nakedGrade.recall * 100).toFixed(1)}% precision ${(nakedGrade.precision * 100).toFixed(1)}%`,
      );

      const harnessFindings = await runHarnessAudit(task, context, harnessRunId);
      persistFindings(db, harnessFindings);
      const harnessGrade = gradeDetection(task.expectedFindings, harnessFindings);
      harnessRows.push({
        expected: task.expectedFindings.length,
        truePositives: harnessGrade.truePositives,
        detected: harnessFindings.length,
      });
      console.log(
        `[score]   harness recall ${(harnessGrade.recall * 100).toFixed(1)}% precision ${(harnessGrade.precision * 100).toFixed(1)}%`,
      );
    } catch (error) {
      console.warn(
        `[score] skip ${task.id}:`,
        error instanceof Error ? error.message : error,
      );
    } finally {
      if (repoPath) rmSync(repoPath, { recursive: true, force: true });
      for (const path of cleanupPaths) rmSync(path, { force: true });
    }
  }

  const naked = aggregateMetrics("naked", nakedRows);
  const harness = aggregateMetrics("harness", harnessRows);

  persistAggregateScore(db, nakedAggregateRunId, naked);
  persistAggregateScore(db, harnessAggregateRunId, harness);

  return { naked, harness };
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  scoreBenchmark()
    .then(({ naked, harness }) => {
      console.log("\n[score] done");
      console.log(
        `  naked   recall ${(naked.recall * 100).toFixed(1)}% | precision ${(naked.precision * 100).toFixed(1)}% (${naked.truePositives}/${naked.expected} expected, ${naked.detected} detected)`,
      );
      console.log(
        `  harness recall ${(harness.recall * 100).toFixed(1)}% | precision ${(harness.precision * 100).toFixed(1)}% (${harness.truePositives}/${harness.expected} expected, ${harness.detected} detected)`,
      );
    })
    .catch((error) => {
      console.error("[score] failed:", error);
      process.exit(1);
    });
}
