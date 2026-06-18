/**
 * Probe script: run contrast + focus-order inspectors on fixtures/bad.html.
 * Run with: pnpm --filter @ramp/harness probe:inspect
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closePage, launchPage } from "./browser.js";
import { checkContrast, getFocusOrder } from "./inspectors.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, "../fixtures/bad.html");

const page = await launchPage(fixture);

console.log("checkContrast('.low-contrast'):");
console.log(JSON.stringify(await checkContrast(page, ".low-contrast"), null, 2));

console.log("\ncheckContrast('h1') (sanity — should pass):");
const h1 = await checkContrast(page, "h1");
console.log(`  ratio=${h1.ratio} passesAA=${h1.passesAA}`);

console.log("\ngetFocusOrder():");
for (const stop of await getFocusOrder(page)) {
  console.log(
    `  ${stop.index}. <${stop.tag}> ${stop.selector}` +
      `${stop.text ? ` "${stop.text}"` : ""} — visibleFocus=${stop.hasVisibleFocus}`,
  );
}

await closePage(page);
