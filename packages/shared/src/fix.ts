/**
 * Fix loop entry point — STUB.
 *
 * Implemented by packages/control-plane (apply → validate → revert-on-failure).
 * This module pins the signature so dependents compile against a stable shape.
 */
import type { Finding, FixResult } from "./types.js";

export interface RunFixLoopOptions {
  /** The run this fix loop belongs to (foreign key into `runs`). */
  runId: string;
  /** Local path to the checked-out repository to modify. */
  repoPath: string;
  /** Findings to attempt repairs for. */
  findings: Finding[];
  /** Max repair attempts per finding before giving up. Defaults to 1. */
  maxFixAttempts?: number;
  /** When true, only apply high-confidence, low-risk fixes. Defaults to true. */
  safeMode?: boolean;
}

/**
 * Applies fixes for the given findings, validating after each change and
 * reverting anything that breaks the build / page.
 *
 * @returns one FixResult per attempted finding.
 * @throws always — not yet implemented. The control-plane replaces this.
 */
export async function runFixLoop(
  _options: RunFixLoopOptions,
): Promise<FixResult[]> {
  throw new Error(
    "runFixLoop is not implemented yet (see packages/control-plane)",
  );
}
