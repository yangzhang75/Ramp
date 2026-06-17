/**
 * @ramp/bench — A11y-Bench: the hand-annotated benchmark of real open-source
 * frontend projects used to quantify detection + fix recall.
 *
 * Responsibilities (all TODO):
 *  - load / persist BenchTask fixtures
 *  - run a model (raw vs harness) against a task
 *  - compare findings to ground truth → detection recall, fix recall
 */
import type { AnnotatedFinding, BenchTask, Finding } from "@ramp/shared";

export interface DetectionReport {
  taskId: string;
  expected: number;
  detected: number;
  /** Fraction of ground-truth findings that were detected (0..1). */
  recall: number;
}

/** Loads the benchmark task fixtures. STUB — returns empty until seeded. */
export async function loadBenchTasks(): Promise<BenchTask[]> {
  return [];
}

/**
 * Grades audit findings against a task's ground truth.
 * STUB — real matching (type + file/line) lands with the benchmark seed.
 */
export function gradeDetection(
  task: BenchTask,
  _findings: Finding[],
): DetectionReport {
  const expected: AnnotatedFinding[] = task.expectedFindings;
  return {
    taskId: task.id,
    expected: expected.length,
    detected: 0,
    recall: 0,
  };
}
