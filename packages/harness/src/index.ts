/**
 * @ramp/harness — the layer that turns a general LLM into a WCAG expert.
 *
 * Planned tool surface (all TODO):
 *  - WCAG rule library (per-criterion detail + remediation guidance)
 *  - DOM reasoning (read + locate offending nodes, map to source files)
 *  - screen-reader simulation (what a blind user actually hears)
 *  - color-contrast computation
 *
 * It will provide the real implementation of `runAudit` from @ramp/shared.
 */
import { runAudit, type RunAuditOptions, type Finding } from "@ramp/shared";

export const HARNESS_VERSION = "0.0.0";

/** Re-export the audit signature the harness will implement. */
export { runAudit };
export type { RunAuditOptions, Finding };
