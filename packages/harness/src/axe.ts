/**
 * Free, deterministic axe-core scan (no LLM, no paid API). Used by the fix
 * loop's verification step to confirm a violation is gone after a patch.
 */
import { AxeBuilder } from "@axe-core/playwright";
import { closePage, launchPage } from "./browser.js";

export interface AxeViolationSummary {
  id: string;
  impact: string | null;
  nodes: number;
  help: string;
}

/** Runs axe-core against a URL or local HTML file; returns violation summaries. */
export async function axeScan(target: string): Promise<AxeViolationSummary[]> {
  const page = await launchPage(target);
  try {
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      nodes: v.nodes.length,
      help: v.help,
    }));
  } finally {
    await closePage(page);
  }
}
