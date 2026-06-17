/**
 * Probe script: print the accessibility tree for fixtures/bad.html.
 * Run with: pnpm --filter @ramp/harness probe:tree
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatTree, getAccessibilityTree } from "./a11y-tree.js";
import { closePage, launchPage } from "./browser.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, "../fixtures/bad.html");

const page = await launchPage(fixture);
const tree = await getAccessibilityTree(page);
console.log("Accessibility tree for bad.html:\n");
console.log(formatTree(tree));
await closePage(page);
