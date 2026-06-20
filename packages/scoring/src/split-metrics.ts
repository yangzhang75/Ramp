/**
 * Per-auditMode metrics from persisted benchmark runs (no API calls).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AuditMode, BenchTask, Db, Finding, Severity, ViolationType } from "@ramp/shared";
import { getDb, resolveAuditMode } from "@ramp/shared";
import { findings as findingsTable, runs, scores } from "@ramp/shared/db";
import { gradeDetection } from "./match.js";
import type { DetectionMetrics } from "./score.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(__dirname, "../../bench/data/tasks");

export function loadBenchTasksFromDisk(): BenchTask[] {
  if (!existsSync(TASKS_DIR)) return [];
  return readdirSync(TASKS_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) =>
      JSON.parse(readFileSync(join(TASKS_DIR, name), "utf8")) as BenchTask,
    );
}

export function countTasksByAuditMode(tasks: BenchTask[]): {
  all: number;
  htmlLive: number;
  sourceCode: number;
} {
  let htmlLive = 0;
  let sourceCode = 0;
  for (const task of tasks) {
    if (resolveAuditMode(task) === "html-live") htmlLive++;
    else sourceCode++;
  }
  return { all: tasks.length, htmlLive, sourceCode };
}

export function aggregateDetectionMetrics(
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

function batchIdFromRunId(runId: string): string | null {
  const match = runId.match(/-(\d+)$/);
  return match?.[1] ?? null;
}

/** Latest bench/lb aggregate naked batch id in scores. */
export function latestScoreBatchId(db: Db = getDb()): string | null {
  const row = db
    .select()
    .from(scores)
    .all()
    .filter(
      (entry) =>
        entry.runId.includes("-naked-") &&
        !entry.runId.startsWith("ramp-") &&
        (entry.runId.startsWith("bench") || entry.runId.startsWith("lb-")),
    )
    .sort((a, b) => b.computedAt.localeCompare(a.computedAt))[0];
  return row ? batchIdFromRunId(row.runId) : null;
}

function loadRunFindings(db: Db, runId: string): Finding[] {
  return db
    .select()
    .from(findingsTable)
    .all()
    .filter((row) => row.runId === runId)
    .map((row) => ({
      id: row.id,
      runId: row.runId,
      type: row.type as ViolationType,
      severity: row.severity as Severity,
      wcagRule: row.wcagRule,
      domNode: row.domNode ?? undefined,
      page: row.page ?? undefined,
      sourceFile: row.sourceFile ?? undefined,
      line: row.line ?? undefined,
      confidence: row.confidence,
      autoFixable: row.autoFixable,
      evidence: row.evidence ?? undefined,
    }));
}

function hasRun(db: Db, runId: string): boolean {
  return db.select().from(runs).all().some((row) => row.id === runId);
}

/** Re-grades a batch, optionally filtered to one audit mode. */
export function computeBatchMetricsForAuditMode(
  db: Db,
  batchId: string,
  filter: AuditMode | "all",
): { naked: DetectionMetrics; harness: DetectionMetrics } | null {
  const tasks = loadBenchTasksFromDisk();
  const filtered =
    filter === "all"
      ? tasks
      : tasks.filter((task) => resolveAuditMode(task) === filter);

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

  for (const task of filtered) {
    const nakedRunId = `${task.id}-naked-${batchId}`;
    const harnessRunId = `${task.id}-harness-${batchId}`;

    if (!hasRun(db, nakedRunId) && !hasRun(db, harnessRunId)) continue;

    const nakedFindings = loadRunFindings(db, nakedRunId);
    const harnessFindings = loadRunFindings(db, harnessRunId);

    const nakedGrade = gradeDetection(task.expectedFindings, nakedFindings);
    nakedRows.push({
      expected: task.expectedFindings.length,
      truePositives: nakedGrade.truePositives,
      detected: nakedFindings.length,
    });

    const harnessGrade = gradeDetection(task.expectedFindings, harnessFindings);
    harnessRows.push({
      expected: task.expectedFindings.length,
      truePositives: harnessGrade.truePositives,
      detected: harnessFindings.length,
    });
  }

  if (nakedRows.length === 0) return null;

  return {
    naked: aggregateDetectionMetrics("naked", nakedRows),
    harness: aggregateDetectionMetrics("harness", harnessRows),
  };
}
