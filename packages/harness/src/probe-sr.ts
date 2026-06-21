/**
 * Probe script: print the screen-reader sequence for fixtures/bad.html.
 * Run with: pnpm --filter @ramp/harness probe:sr
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAccessibilityTree } from "./a11y-tree.js";
import { closePage, launchPage } from "./browser.js";
import { serializeForScreenReader } from "./screen-reader.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, "../fixtures/bad.html");

const page = await launchPage(fixture);
const tree = await getAccessibilityTree(page);
const sequence = serializeForScreenReader(tree);

console.log("What a screen reader announces on bad.html:\n");
sequence.forEach((line, i) => console.log(`${String(i + 1).padStart(2)}. ${line}`));
console.log("\nAs array:");
console.log(JSON.stringify(sequence));

await closePage(page);
