/**
 * Probe: run semantic-quality review on a fixture and print judgments.
 * Run with OPENAI_API_KEY (or ANTHROPIC) in env:
 *   pnpm --filter @ramp/harness probe:semantic
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reviewSemanticQuality } from "./semantic-review.js";

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(here, "../fixtures/garbage-names.html");

console.log(`semantic review of ${target}\n`);
const items = await reviewSemanticQuality(target);
for (const it of items) {
  const mark = it.meaningful ? "✅ meaningful" : "❌ NOT meaningful";
  console.log(`${mark}  [${it.kind}] name=${JSON.stringify(it.name)}`);
  if (!it.meaningful) {
    console.log(`    reason: ${it.reason}`);
    console.log(`    suggest: ${JSON.stringify(it.suggestion)}`);
  }
}
const bad = items.filter((i) => !i.meaningful).length;
console.log(`\n${bad}/${items.length} named elements are semantically empty (axe would pass ALL of them).`);
