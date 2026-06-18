/**
 * @ramp/control-plane — orchestrates the full loop and owns the fix loop:
 *   Detect (harness) → Score (scoring) → Fix → Validate → Pull Request
 *
 * It will provide the real implementation of `runFixLoop` from @ramp/shared
 * and expose a single `runPipeline` entry the dashboard / CLI calls.
 */
import {
  runFixLoop,
  type RunFixLoopOptions,
  type FixResult,
} from "@ramp/shared";

export interface PipelineOptions {
  repoUrl: string;
  branch?: string;
  targetUrl?: string;
  framework?: string;
  packageManager?: string;
  fixScope?: string[];
  createPullRequest?: boolean;
  safeMode?: boolean;
}

export interface PipelineResult {
  runId: string;
  status: string;
  pullRequestUrl?: string;
}

/**
 * Runs the end-to-end audit→fix→PR pipeline. STUB.
 */
export async function runPipeline(
  _options: PipelineOptions,
): Promise<PipelineResult> {
  throw new Error("runPipeline is not implemented yet");
}

/** Re-export the fix-loop signature the control-plane will implement. */
export { runFixLoop };
export type { RunFixLoopOptions, FixResult };

/** GitHub PR pipeline. */
export { openPr, preflight, parseTargetRepo } from "./github.js";
export type { OpenPrOptions, PreflightResult } from "./github.js";

/** HTTP server + DB wiring. */
export { createServer, startServer } from "./server.js";
export {
  ensureSchema,
  insertRun,
  insertFindings,
  insertScore,
  setRunStatus,
  getRunWithFindings,
} from "./db.js";
