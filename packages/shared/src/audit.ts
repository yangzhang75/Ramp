/**
 * Audit entry point — STUB.
 *
 * Implemented by packages/harness (the WCAG-expert harness). This module only
 * pins the function signature so other packages can depend on a stable shape
 * while the harness is built out.
 */
import type { Finding } from "./types.js";

export interface RunAuditOptions {
  /** The run this audit belongs to (foreign key into `runs`). */
  runId: string;
  /** Local path to the checked-out repository. */
  repoPath: string;
  /** Live URL to scan with Playwright + axe-core, when available. */
  targetUrl?: string;
  /** Restrict detection to these violation types; omit to scan for all. */
  fixScope?: string[];
}

/**
 * Audits a repository / live URL for WCAG violations.
 *
 * @returns the findings discovered for the run.
 * @throws always — not yet implemented. The harness package replaces this.
 */
export async function runAudit(_options: RunAuditOptions): Promise<Finding[]> {
  throw new Error("runAudit is not implemented yet (see packages/harness)");
}
