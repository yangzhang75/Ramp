/**
 * @ramp/dashboard — UI showing the issue list, severity, before/after score,
 * live fix progress, and the resulting PR summary.
 *
 * This is currently a compilable shell. The dashboard owner will add the
 * Vite + React frontend on top of these data shapes.
 */
import type { Finding, FixResult, Score } from "@ramp/shared";

/** Shape the dashboard renders for a single run. */
export interface RunView {
  runId: string;
  status: string;
  before?: Score;
  after?: Score;
  findings: Finding[];
  fixes: FixResult[];
  pullRequestUrl?: string;
}

/** Placeholder bootstrap. STUB — replaced when the frontend is wired up. */
export function startDashboard(): void {
  console.log("Ramp dashboard shell — frontend not implemented yet.");
}
