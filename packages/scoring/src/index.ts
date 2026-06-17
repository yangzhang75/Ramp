/**
 * @ramp/scoring — compliance scoring + benchmark recall metrics.
 *
 * The compliance score is intentionally simple and explainable:
 *   score = max(0, 100 - weighted_violation_penalty)
 * It is a comparison signal (before vs after), NOT a claim of full WCAG
 * compliance.
 */
import type { Finding, Severity } from "@ramp/shared";

/** Penalty per violation, by severity. */
export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 12,
  serious: 8,
  moderate: 4,
  minor: 2,
};

export interface ScoreBreakdown {
  score: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  totalViolations: number;
}

/** Computes a 0..100 compliance score from a set of findings. */
export function computeScore(findings: Finding[]): ScoreBreakdown {
  const counts: Record<Severity, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  let penalty = 0;
  for (const f of findings) {
    counts[f.severity] += 1;
    penalty += SEVERITY_WEIGHTS[f.severity];
  }
  return {
    score: Math.max(0, 100 - penalty),
    critical: counts.critical,
    serious: counts.serious,
    moderate: counts.moderate,
    minor: counts.minor,
    totalViolations: findings.length,
  };
}
