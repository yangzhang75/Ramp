/**
 * Probe script: open fixtures/bad.html and print what axe-core finds.
 * Run with: pnpm --filter @ramp/harness probe:axe
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AxeBuilder } from "@axe-core/playwright";
import { closePage, launchPage } from "./browser.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, "../fixtures/bad.html");

const page = await launchPage(fixture);
const results = await new AxeBuilder({ page }).analyze();

console.log(`axe found ${results.violations.length} violation type(s) on bad.html\n`);
for (const v of results.violations) {
  console.log(`- ${v.id} [${v.impact ?? "n/a"}] — ${v.help}`);
  for (const node of v.nodes) {
    console.log(`    target: ${node.target.join(" ")}`);
    console.log(`    html:   ${node.html}`);
  }
}

await closePage(page);
