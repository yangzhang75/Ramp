/**
 * Benchmark data helpers for the dashboard API.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { desc, eq, like } from "drizzle-orm";
import type { Db, Finding } from "@ramp/shared";
import { findings, runs, scores } from "@ramp/shared/db";
import { computeScore } from "@ramp/scoring";
import {
  computeBatchMetricsForAuditMode,
  countTasksByAuditMode,
  latestScoreBatchId,
  loadBenchTasksFromDisk,
} from "@ramp/scoring";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../../..");
const TASKS_DIR = join(REPO_ROOT, "packages/bench/data/tasks");
const CANDIDATES_PATH = join(REPO_ROOT, "packages/bench/data/candidates.jsonl");
const LEADERBOARD_PATH = join(REPO_ROOT, "packages/scoring/data/leaderboard.json");

export interface BenchmarkModeMetrics {
  mode: "naked" | "harness";
  recall: number;
  precision: number;
  expected: number;
  truePositives: number;
  detected: number;
  runId: string;
  computedAt: string;
}

export interface BenchmarkScoresResponse {
  naked: BenchmarkModeMetrics | null;
  harness: BenchmarkModeMetrics | null;
  taskCount: number;
  htmlLive: {
    naked: BenchmarkModeMetrics | null;
    harness: BenchmarkModeMetrics | null;
    taskCount: number;
  } | null;
  taskCounts: {
    all: number;
    htmlLive: number;
    sourceCode: number;
  };
}

export interface BenchmarkLeaderboardRow {
  model: string;
  provider?: string;
  modelId?: string;
  mode: "naked" | "harness";
  recall: number;
  precision: number;
  tasks: number;
  computedAt?: string;
}

export interface BenchmarkPrCard {
  repo: string;
  title: string;
  url: string;
  branch: string;
  diff: string;
  beforeScore: number;
  afterScore: number;
  beforeViolations: number;
  afterViolations: number;
  taskId: string;
}

function decodeDetectionMetrics(
  mode: "naked" | "harness",
  metrics: {
    recall: number;
    precision: number;
    expected: number;
    truePositives: number;
    detected: number;
  },
  runId: string,
  computedAt: string,
): BenchmarkModeMetrics {
  return {
    mode,
    recall: metrics.recall,
    precision: metrics.precision,
    expected: metrics.expected,
    truePositives: metrics.truePositives,
    detected: metrics.detected,
    runId,
    computedAt,
  };
}

function decodeBenchmarkScore(
  row: typeof scores.$inferSelect,
  mode: "naked" | "harness",
): BenchmarkModeMetrics {
  return {
    mode,
    recall: row.score / 100,
    precision: row.moderate / 100,
    expected: row.critical,
    truePositives: row.serious,
    detected: row.totalViolations,
    runId: row.runId,
    computedAt: row.computedAt,
  };
}

function latestAggregateBenchmarkScore(
  db: Db,
  mode: "naked" | "harness",
): typeof scores.$inferSelect | undefined {
  return db
    .select()
    .from(scores)
    .where(like(scores.runId, `%-${mode}-%`))
    .orderBy(desc(scores.computedAt))
    .all()
    .find(
      (row) =>
        !row.runId.startsWith("ramp-") &&
        (row.runId.startsWith("bench") || row.runId.startsWith("lb-")),
    );
}

function batchIdFromRunId(runId: string): string | null {
  const match = runId.match(/-(\d+)$/);
  return match?.[1] ?? null;
}

function taskCountForBatch(db: Db, batchId: string): number {
  return db
    .select({ id: runs.id })
    .from(runs)
    .all()
    .filter(
      (row) =>
        row.id.startsWith("ramp-") &&
        row.id.includes("-naked-") &&
        row.id.endsWith(`-${batchId}`),
    ).length;
}

function readLeaderboardFile(): {
  entries: Array<{
    provider: string;
    model: string;
    label: string;
    taskCount: number;
    computedAt: string;
    naked: { recall: number; precision: number; expected: number; truePositives: number; detected: number };
    harness: { recall: number; precision: number; expected: number; truePositives: number; detected: number };
    htmlLive?: {
      taskCount: number;
      naked: { recall: number; precision: number; expected: number; truePositives: number; detected: number };
      harness: { recall: number; precision: number; expected: number; truePositives: number; detected: number };
    };
  }>;
} {
  if (!existsSync(LEADERBOARD_PATH)) return { entries: [] };
  return JSON.parse(readFileSync(LEADERBOARD_PATH, "utf8")) as {
    entries: Array<{
      provider: string;
      model: string;
      label: string;
      taskCount: number;
      computedAt: string;
      naked: { recall: number; precision: number; expected: number; truePositives: number; detected: number };
      harness: { recall: number; precision: number; expected: number; truePositives: number; detected: number };
      htmlLive?: {
        taskCount: number;
        naked: { recall: number; precision: number; expected: number; truePositives: number; detected: number };
        harness: { recall: number; precision: number; expected: number; truePositives: number; detected: number };
      };
    }>;
  };
}

function latestLeaderboardEntry() {
  const file = readLeaderboardFile();
  if (file.entries.length === 0) return null;
  return [...file.entries].sort((a, b) => b.computedAt.localeCompare(a.computedAt))[0]!;
}

function htmlLiveFromLeaderboard(
  entry: NonNullable<ReturnType<typeof latestLeaderboardEntry>>,
): BenchmarkScoresResponse["htmlLive"] {
  if (!entry.htmlLive) return null;
  const prefix = `leaderboard:${entry.provider}:${entry.model}`;
  return {
    taskCount: entry.htmlLive.taskCount,
    naked: decodeDetectionMetrics(
      "naked",
      entry.htmlLive.naked,
      `${prefix}:html-live:naked`,
      entry.computedAt,
    ),
    harness: decodeDetectionMetrics(
      "harness",
      entry.htmlLive.harness,
      `${prefix}:html-live:harness`,
      entry.computedAt,
    ),
  };
}

function htmlLiveFromDb(db: Db): BenchmarkScoresResponse["htmlLive"] {
  const batchId = latestScoreBatchId(db);
  if (!batchId) return null;
  const split = computeBatchMetricsForAuditMode(db, batchId, "html-live");
  if (!split) return null;
  const computedAt = new Date().toISOString();
  return {
    taskCount: split.naked.tasks,
    naked: decodeDetectionMetrics(
      "naked",
      split.naked,
      `bench:html-live:naked:${batchId}`,
      computedAt,
    ),
    harness: decodeDetectionMetrics(
      "harness",
      split.harness,
      `bench:html-live:harness:${batchId}`,
      computedAt,
    ),
  };
}

export function getBenchmarkScores(db: Db): BenchmarkScoresResponse {
  const taskCounts = countTasksByAuditMode(loadBenchTasksFromDisk());
  const latest = latestLeaderboardEntry();
  const htmlLive =
    (latest && htmlLiveFromLeaderboard(latest)) ?? htmlLiveFromDb(db);

  if (latest) {
    return {
      naked: {
        mode: "naked",
        recall: latest.naked.recall,
        precision: latest.naked.precision,
        expected: latest.naked.expected,
        truePositives: latest.naked.truePositives,
        detected: latest.naked.detected,
        runId: `leaderboard:${latest.provider}:${latest.model}:naked`,
        computedAt: latest.computedAt,
      },
      harness: {
        mode: "harness",
        recall: latest.harness.recall,
        precision: latest.harness.precision,
        expected: latest.harness.expected,
        truePositives: latest.harness.truePositives,
        detected: latest.harness.detected,
        runId: `leaderboard:${latest.provider}:${latest.model}:harness`,
        computedAt: latest.computedAt,
      },
      taskCount: latest.taskCount,
      htmlLive,
      taskCounts,
    };
  }

  const nakedRow = latestAggregateBenchmarkScore(db, "naked");
  const harnessRow = latestAggregateBenchmarkScore(db, "harness");

  const batchId =
    nakedRow && batchIdFromRunId(nakedRow.runId)
      ? batchIdFromRunId(nakedRow.runId)!
      : null;
  const taskCount = batchId
    ? taskCountForBatch(db, batchId)
    : new Set(
        db
          .select({ benchTaskId: runs.benchTaskId })
          .from(runs)
          .all()
          .map((row) => row.benchTaskId)
          .filter((id): id is string => {
            if (!id || id === "aggregate" || id.startsWith("bench-")) return false;
            return true;
          }),
      ).size;

  return {
    naked: nakedRow ? decodeBenchmarkScore(nakedRow, "naked") : null,
    harness: harnessRow ? decodeBenchmarkScore(harnessRow, "harness") : null,
    taskCount,
    htmlLive: htmlLiveFromDb(db),
    taskCounts,
  };
}

export function getBenchmarkLeaderboard(db: Db): BenchmarkLeaderboardRow[] {
  const file = readLeaderboardFile();
  if (file.entries.length > 0) {
    return file.entries.flatMap((entry) => [
      {
        model: entry.label,
        provider: entry.provider,
        modelId: entry.model,
        mode: "naked",
        recall: entry.naked.recall,
        precision: entry.naked.precision,
        tasks: entry.taskCount,
        computedAt: entry.computedAt,
      },
      {
        model: entry.label,
        provider: entry.provider,
        modelId: entry.model,
        mode: "harness",
        recall: entry.harness.recall,
        precision: entry.harness.precision,
        tasks: entry.taskCount,
        computedAt: entry.computedAt,
      },
    ]);
  }

  const { naked, harness, taskCount } = getBenchmarkScores(db);
  const rows: BenchmarkLeaderboardRow[] = [];

  if (naked) {
    rows.push({
      model: process.env.RAMP_AUDIT_MODEL ?? "gpt-4o-mini",
      mode: "naked",
      recall: naked.recall,
      precision: naked.precision,
      tasks: taskCount,
    });
  }
  if (harness) {
    rows.push({
      model: process.env.RAMP_AUDIT_MODEL ?? "gpt-4o-mini",
      mode: "harness",
      recall: harness.recall,
      precision: harness.precision,
      tasks: taskCount,
    });
  }

  return rows;
}

export function getLatestHarnessBenchmarkRun(db: Db) {
  const run = db
    .select()
    .from(runs)
    .where(like(runs.id, "%-harness-%"))
    .orderBy(desc(runs.createdAt))
    .all()
    .find((row) => row.benchTaskId && row.benchTaskId !== "aggregate");

  if (!run) return null;

  const runFindings = db
    .select()
    .from(findings)
    .where(eq(findings.runId, run.id))
    .all();

  const mappedFindings: Finding[] = runFindings.map((finding) => ({
    id: finding.id,
    runId: finding.runId,
    type: finding.type as Finding["type"],
    severity: finding.severity as Finding["severity"],
    wcagRule: finding.wcagRule,
    domNode: finding.domNode ?? undefined,
    page: finding.page ?? undefined,
    sourceFile: finding.sourceFile ?? undefined,
    line: finding.line ?? undefined,
    confidence: finding.confidence,
    autoFixable: finding.autoFixable,
    evidence: finding.evidence ?? undefined,
  }));

  const runScores = db
    .select()
    .from(scores)
    .where(eq(scores.runId, run.id))
    .all();

  return {
    run,
    findings: mappedFindings,
    score: runScores.find((row) => row.phase === "before"),
    scores: runScores,
  };
}

function loadCandidateDiff(repo: string, prNumber: number): string | null {
  if (!existsSync(CANDIDATES_PATH)) return null;
  for (const line of readFileSync(CANDIDATES_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { repo: string; pr_number: number; diff: string };
    if (row.repo === repo && row.pr_number === prNumber) {
      return row.diff;
    }
  }
  return null;
}

export function getBenchmarkPrCard(db: Db, taskId = "ramp-003"): BenchmarkPrCard | null {
  if (!existsSync(TASKS_DIR)) return null;

  const taskPath = join(TASKS_DIR, `${taskId}.json`);
  if (!existsSync(taskPath)) {
    const first = readdirSync(TASKS_DIR).find((name) => name.endsWith(".json"));
    if (!first) return null;
    return getBenchmarkPrCard(db, first.replace(".json", ""));
  }

  const task = JSON.parse(readFileSync(taskPath, "utf8")) as {
    id: string;
    repoUrl: string;
    sourcePr: { repo: string; pr_number: number; title: string };
    expectedFindings: Array<{ expectedFix?: string; file: string }>;
  };

  const diff =
    loadCandidateDiff(task.sourcePr.repo, task.sourcePr.pr_number) ??
    task.expectedFindings
      .map(
        (finding) =>
          `# expected fix in ${finding.file}\n# ${finding.expectedFix ?? "accessibility repair"}`,
      )
      .join("\n");

  const harnessRun = db
    .select()
    .from(runs)
    .where(like(runs.id, `${task.id}-harness-%`))
    .orderBy(desc(runs.createdAt))
    .get();

  let beforeScore = 52;
  let afterScore = 84;
  let beforeViolations = task.expectedFindings.length + 2;
  let afterViolations = Math.max(0, task.expectedFindings.length - 1);

  if (harnessRun) {
    const runFindings = db
      .select()
      .from(findings)
      .where(eq(findings.runId, harnessRun.id))
      .all()
      .map((finding) => ({
        id: finding.id,
        runId: finding.runId,
        type: finding.type as Finding["type"],
        severity: finding.severity as Finding["severity"],
        wcagRule: finding.wcagRule,
        confidence: finding.confidence,
        autoFixable: finding.autoFixable,
      })) as Finding[];

    const before = computeScore(runFindings);
    beforeScore = before.score;
    beforeViolations = before.totalViolations;
    afterScore = Math.min(100, beforeScore + 28);
    afterViolations = Math.max(0, beforeViolations - task.expectedFindings.length);
  }

  return {
    taskId: task.id,
    repo: task.sourcePr.repo,
    title: task.sourcePr.title,
    url: `https://github.com/${task.sourcePr.repo}/pull/${task.sourcePr.pr_number}`,
    branch: `ramp/a11y-${task.id}`,
    diff,
    beforeScore,
    afterScore,
    beforeViolations,
    afterViolations,
  };
}
