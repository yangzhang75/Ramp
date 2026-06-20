/**
 * Ramp vs axe — the demo's killer comparison. Isolated; does NOT touch runAudit.
 *
 * Runs, on the SAME page:
 *   A) plain axe-core           — what the industry tool reports
 *   B) Ramp semantic review     — name-quality issues axe is blind to
 *
 * Prints "axe: N issues / Ramp: N + M semantic issues axe can't see" and writes
 * a JSON report (for the dashboard / Devpost).
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { axeScan, type AxeViolationSummary } from "./axe.js";
import { reviewSemanticQuality, type SemanticIssue } from "./semantic-review.js";

export interface VsAxeReport {
  target: string;
  axe: { count: number; violations: AxeViolationSummary[] };
  ramp: {
    axeCount: number;
    semanticReviewed: number;
    semanticIssues: SemanticIssue[]; // meaningful:false only
  };
  headline: string;
}

export async function runVsAxe(target: string): Promise<VsAxeReport> {
  const [axe, semantic] = await Promise.all([
    axeScan(target),
    reviewSemanticQuality(target),
  ]);
  const semanticIssues = semantic.filter((s) => !s.meaningful);
  return {
    target,
    axe: { count: axe.length, violations: axe },
    ramp: {
      axeCount: axe.length,
      semanticReviewed: semantic.length,
      semanticIssues,
    },
    headline: `axe: ${axe.length} issue(s) / Ramp: ${axe.length} axe + ${semanticIssues.length} semantic issue(s) axe cannot see`,
  };
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url));
  const target = process.argv[2]
    ? resolve(process.argv[2])
    : resolve(here, "../fixtures/garbage-names.html");
  const outPath = process.argv[3] ?? resolve(here, "../fixtures/vs-axe-report.json");

  const report = await runVsAxe(target);

  console.log(`\n=== Ramp vs axe — ${target} ===\n`);
  console.log(`axe-core: ${report.axe.count} issue(s)`);
  for (const v of report.axe.violations) console.log(`  - ${v.id} [${v.impact}]`);
  console.log(
    `\nRamp also flags ${report.ramp.semanticIssues.length} SEMANTIC issue(s) axe passed silently:`,
  );
  for (const s of report.ramp.semanticIssues) {
    console.log(`  - [${s.kind}] name=${JSON.stringify(s.name)}`);
    console.log(`      axe: PASS (a name exists)  |  Ramp: NOT meaningful — ${s.reason}`);
    console.log(`      Ramp fix → ${JSON.stringify(s.suggestion)}`);
  }
  console.log(`\n>>> ${report.headline}`);

  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nJSON report written: ${outPath}`);
}
