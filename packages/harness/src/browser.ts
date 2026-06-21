/**
 * Headless browser plumbing for the audit harness.
 *
 * `launchPage` accepts an http(s) URL OR a local HTML file path and returns a
 * loaded Playwright Page. `closePage` tears down the owning browser.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright";

/** Converts a target (URL or local path) into a navigable URL string. */
export function toUrl(target: string): string {
  if (/^https?:\/\//i.test(target) || target.startsWith("file://")) {
    return target;
  }
  const abs = resolve(target);
  if (!existsSync(abs)) {
    throw new Error(`Target is neither a URL nor an existing file: ${target}`);
  }
  return pathToFileURL(abs).href;
}

/**
 * Launches headless Chromium and navigates to `target`.
 * @param target an http(s) URL or a local HTML file path.
 */
export async function launchPage(target: string): Promise<Page> {
  const browser = await chromium.launch({ headless: true });
  // axe-core/playwright requires a page from an explicit context.
  const context = await browser.newContext();
  const page = await context.newPage();
  // "domcontentloaded" not "load": we must NOT block on external resources
  // (e.g. an <img> pointing at a slow/unreachable CDN). The DOM + inline CSS
  // are all the a11y tools (axe, a11y-tree, contrast) need; waiting for the
  // load event made page.goto hang 30s when an external image never loaded.
  await page.goto(toUrl(target), { waitUntil: "domcontentloaded", timeout: 30000 });
  return page;
}

/** Closes the browser that owns `page`. */
export async function closePage(page: Page): Promise<void> {
  await page.context().browser()?.close();
}
