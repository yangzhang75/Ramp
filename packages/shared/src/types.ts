/**
 * Core domain types shared across every Ramp package.
 *
 * The four headline types are {@link BenchTask}, {@link Finding},
 * {@link FixResult}, and {@link Score}. They mirror the columns of the
 * Drizzle tables in `db/schema.ts` but use JS-friendly shapes.
 */

/** WCAG-style severity buckets used for scoring penalties. */
export type Severity = "critical" | "serious" | "moderate" | "minor";

/** The accessibility violation categories Ramp can detect / repair. */
export type ViolationType =
  | "missing_alt_text"
  | "missing_form_labels"
  | "icon_button_accessible_names"
  | "low_color_contrast"
  | "heading_structure"
  | "missing_landmarks"
  | "missing_focus_indicator"
  | "keyboard_navigation";

/** Lifecycle status of an end-to-end audit→fix→PR run. */
export type RunStatus =
  | "pending"
  | "auditing"
  | "scoring"
  | "fixing"
  | "validating"
  | "pr_open"
  | "completed"
  | "setup_failed"
  | "failed";

/** Outcome of attempting to repair a single finding. */
export type FixStatus = "fixed" | "reverted" | "needs_human_review" | "failed";

/** Which side of the before/after comparison a score belongs to. */
export type ScorePhase = "before" | "after";

// ---------------------------------------------------------------------------
// BenchTask — one entry in the hand-annotated A11y-Bench benchmark.
// ---------------------------------------------------------------------------

/** A ground-truth violation annotated by a human for the benchmark. */
export interface AnnotatedFinding {
  type: ViolationType;
  wcagRule: string;
  /** Source file (repo-relative) where the violation lives. */
  file: string;
  line?: number;
  /** Human description of the correct repair, used to grade fixes. */
  expectedFix?: string;
}

export interface BenchTask {
  id: string;
  repoUrl: string;
  branch?: string;
  framework?: string;
  /** Hand-annotated ground truth used to compute detection/fix recall. */
  expectedFindings: AnnotatedFinding[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Finding — a single violation surfaced by an audit run.
// ---------------------------------------------------------------------------

export interface Finding {
  id: string;
  runId: string;
  type: ViolationType;
  severity: Severity;
  wcagRule: string;
  /** Offending DOM node markup, when captured from a live page. */
  domNode?: string;
  /** Page path the violation was observed on. */
  page?: string;
  /** Best-guess repo-relative source file. */
  sourceFile?: string;
  line?: number;
  /** 0..1 confidence that this is a real, correctly-located violation. */
  confidence: number;
  autoFixable: boolean;
  /** Free-form evidence (screenshot path, contrast ratio, etc.). */
  evidence?: string;
}

// ---------------------------------------------------------------------------
// FixResult — the result of repairing one finding.
// ---------------------------------------------------------------------------

export interface FixResult {
  id: string;
  runId: string;
  findingId: string;
  status: FixStatus;
  file: string;
  /** Unified diff of the applied change. */
  diff?: string;
  /** Short description of the repair strategy used. */
  strategy: string;
  /** Whether post-fix validation (axe/build/lint) passed. */
  validated: boolean;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Score — a compliance score snapshot (before or after fixes).
// ---------------------------------------------------------------------------

export interface Score {
  runId: string;
  phase: ScorePhase;
  /** 0..100 compliance score. */
  score: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  totalViolations: number;
  computedAt: string;
}
