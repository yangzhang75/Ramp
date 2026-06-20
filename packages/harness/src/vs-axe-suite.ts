/**
 * Runs the Ramp-vs-axe comparison across several realistic pages and writes a
 * combined JSON report (for the dashboard / Devpost). Isolated; no runAudit.
 *
 *   pnpm --filter @ramp/harness vs:axe:suite
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runVsAxe, type VsAxeReport } from "./vs-axe.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => resolve(here, "../fixtures", name);

const PAGES: Array<{ label: string; file: string }> = [
  { label: "Acme dashboard (mixed)", file: "garbage-names.html" },
  { label: "Northwind SaaS landing page", file: "saas-landing.html" },
  { label: "Pace Athletics product page", file: "shop-product.html" },
];

const reports: Array<VsAxeReport & { label: string }> = [];
for (const p of PAGES) {
  const r = await runVsAxe(fx(p.file));
  reports.push({ label: p.label, ...r });
  console.log(`\n=== ${p.label} (${p.file}) ===`);
  console.log(`axe-core: ${r.axe.count} issue(s)`);
  console.log(`Ramp semantic issues axe passed silently: ${r.ramp.semanticIssues.length}`);
  for (const s of r.ramp.semanticIssues) {
    console.log(`  - [${s.kind}] ${JSON.stringify(s.name)}  →  fix: ${JSON.stringify(s.suggestion)}`);
  }
  console.log(`>>> ${r.headline}`);
}

const totalAxe = reports.reduce((n, r) => n + r.axe.count, 0);
const totalSemantic = reports.reduce((n, r) => n + r.ramp.semanticIssues.length, 0);
const out = {
  generatedFor: "ramp dashboard / devpost — axe vs Ramp semantic review",
  pages: reports,
  totals: {
    pages: reports.length,
    axeIssues: totalAxe,
    semanticIssuesAxeMissed: totalSemantic,
  },
  headline: `Across ${reports.length} pages — axe: ${totalAxe} issues / Ramp: ${totalSemantic} semantic issues axe passed silently`,
};

const outPath = resolve(here, "../fixtures/vs-axe-report.json");
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\n${out.headline}`);
console.log(`JSON report written: ${outPath}`);
