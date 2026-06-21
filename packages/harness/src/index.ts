/**
 * @ramp/harness — the layer that turns a general LLM into a WCAG expert.
 *
 * Tool surface used by the audit agent:
 *  - accessibility tree (CDP getFullAXTree)
 *  - screen-reader serialization
 *  - color-contrast computation + focus-order simulation
 *  - raw DOM query
 *
 * Provides the real implementation of `runAudit`.
 */
export const HARNESS_VERSION = "0.0.0";

export { runAudit } from "./audit.js";
export type { AuditInput } from "./audit.js";
export { getAccessibilityTree, formatTree } from "./a11y-tree.js";
export type { A11yNode } from "./a11y-tree.js";
export { serializeForScreenReader } from "./screen-reader.js";
export { checkContrast, getFocusOrder } from "./inspectors.js";
export type { ContrastResult, FocusStop } from "./inspectors.js";
export { launchPage, closePage } from "./browser.js";
export { axeScan } from "./axe.js";
export type { AxeViolationSummary } from "./axe.js";
export { reviewSemanticQuality } from "./semantic-review.js";
export type { SemanticIssue, SemanticKind } from "./semantic-review.js";
export { runVsAxe } from "./vs-axe.js";
export type { VsAxeReport } from "./vs-axe.js";
