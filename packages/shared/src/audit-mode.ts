import type { AnnotatedFinding, AuditMode, BenchTask } from "./types.js";

export type { AuditMode };

const HTML_FILE = /\.(html?|htm)$/i;

/** Infers audit mode from expected finding file extensions. */
export function inferAuditMode(
  expectedFindings: Pick<AnnotatedFinding, "file">[],
): AuditMode {
  if (expectedFindings.length === 0) return "source-code";
  return expectedFindings.every((finding) => HTML_FILE.test(finding.file))
    ? "html-live"
    : "source-code";
}

/** Uses explicit task tag when present, otherwise {@link inferAuditMode}. */
export function resolveAuditMode(
  task: Pick<BenchTask, "auditMode" | "expectedFindings">,
): AuditMode {
  return task.auditMode ?? inferAuditMode(task.expectedFindings);
}
