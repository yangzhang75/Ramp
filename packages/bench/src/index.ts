/**
 * @ramp/bench — A11y-Bench: the hand-annotated benchmark of real open-source
 * frontend projects used to quantify detection + fix recall.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnnotatedFinding, BenchTask, Finding } from "@ramp/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(__dirname, "..", "data", "tasks");

export interface DetectionReport {
  taskId: string;
  expected: number;
  detected: number;
  /** Fraction of ground-truth findings that were detected (0..1). */
  recall: number;
}

/** Loads curated benchmark task fixtures from data/tasks/*.json. */
export async function loadBenchTasks(): Promise<BenchTask[]> {
  if (!existsSync(TASKS_DIR)) return [];

  return readdirSync(TASKS_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const raw = readFileSync(join(TASKS_DIR, name), "utf8");
      return JSON.parse(raw) as BenchTask;
    });
}

/**
 * Grades audit findings against a task's ground truth.
 * Match rule: type + wcagRule + task.file === finding.sourceFile
 */
export function gradeDetection(
  task: BenchTask,
  findings: Finding[],
): DetectionReport {
  const expected: AnnotatedFinding[] = task.expectedFindings;
  let detected = 0;

  for (const exp of expected) {
    const hit = findings.some(
      (finding) =>
        finding.type === exp.type &&
        finding.wcagRule === exp.wcagRule &&
        finding.sourceFile === exp.file,
    );
    if (hit) detected++;
  }

  return {
    taskId: task.id,
    expected: expected.length,
    detected,
    recall: expected.length === 0 ? 0 : detected / expected.length,
  };
}

export { curateTasks, type BenchTaskRecord } from "./curate.js";
export { curateHtmlTasks } from "./curate-html.js";
export { mineCandidates, type CandidateRow } from "./mine.js";
