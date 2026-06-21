/**
 * Re-grade an existing scoring batch with current match rules (no API calls).
 * Usage: pnpm exec tsx src/regrade-batch.ts [batchId]
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "@ramp/shared";
import { findings as findingsTable } from "@ramp/shared/db";
import type { Finding, Severity, ViolationType } from "@ramp/shared";
import { gradeDetection } from "./match.js";
import type { BenchTaskRecord } from "./score.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(__dirname, "../../bench/data/tasks");

function loadTasks(): BenchTaskRecord[] {
  return readdirSync(TASKS_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) =>
      JSON.parse(readFileSync(join(TASKS_DIR, name), "utf8")) as BenchTaskRecord,
    );
}

async function main(): Promise<void> {
  const batchId = process.argv[2] ?? "1781863218695";
  const db = getDb();
  const tasks = loadTasks();

  let nakedTp = 0;
  let harnessTp = 0;
  let expected = 0;

  console.log(`\n=== Re-grade batch ${batchId} ===\n`);

  for (const task of tasks) {
    for (const mode of ["naked", "harness"] as const) {
      const runId = `${task.id}-${mode}-${batchId}`;
      const detected: Finding[] = db
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

      if (detected.length === 0) continue;

      const grade = gradeDetection(task.expectedFindings, detected);
      expected += task.expectedFindings.length;
      if (mode === "naked") nakedTp += grade.truePositives;
      else harnessTp += grade.truePositives;

      console.log(
        `${task.id} ${mode.padEnd(7)} TP ${grade.truePositives}/${task.expectedFindings.length} (detected ${detected.length})`,
      );
    }
  }

  const expTotal = expected / 2;
  console.log(
    `\nOld matching would have been lower; new rules:\n` +
      `  naked   ${nakedTp}/${expTotal} (${((100 * nakedTp) / expTotal).toFixed(1)}% recall)\n` +
      `  harness ${harnessTp}/${expTotal} (${((100 * harnessTp) / expTotal).toFixed(1)}% recall)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
