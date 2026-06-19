import { Activity, GitPullRequest } from "lucide-react";
import type { Finding, Severity } from "@ramp/shared";
import { Badge } from "../components/ui/badge.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { useLiveRun } from "../hooks/useRampData.js";

const severityVariant: Record<
  Severity,
  "critical" | "serious" | "moderate" | "minor"
> = {
  critical: "critical",
  serious: "serious",
  moderate: "moderate",
  minor: "minor",
};

function FindingCard({ finding }: { finding: Finding }) {
  const isScreenReader = finding.evidence?.toLowerCase().includes("screen reader");
  const isContrast = finding.evidence?.toLowerCase().includes("contrast");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{finding.type}</Badge>
          <Badge variant={severityVariant[finding.severity]}>
            {finding.severity}
          </Badge>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            WCAG {finding.wcagRule}
          </span>
        </div>
        <CardTitle className="text-base font-medium">
          {finding.sourceFile}
          {finding.line ? `:${finding.line}` : ""}
        </CardTitle>
        <CardDescription>
          Confidence {Math.round(finding.confidence * 100)}% ·{" "}
          {finding.autoFixable ? "Auto-fixable" : "Needs review"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={`rounded-md border p-4 text-sm leading-relaxed ${
            isScreenReader
              ? "border-blue-500/30 bg-blue-500/10"
              : isContrast
                ? "border-amber-500/30 bg-amber-500/10"
                : "border-[var(--color-border)] bg-[var(--color-muted)]/40"
          }`}
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
            {isScreenReader
              ? "Screen reader evidence"
              : isContrast
                ? "Contrast evidence"
                : "Evidence"}
          </p>
          <p className="font-mono text-[13px]">
            {finding.evidence ?? "No evidence captured for this finding."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function LiveRunPage() {
  const { data, findings, loading, error, usingMock } = useLiveRun();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[var(--color-primary)]">
            <Activity className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-wide">
              Live Run
            </span>
          </div>
          <h2 className="text-2xl font-semibold">Audit findings</h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {loading
              ? "Loading latest harness run…"
              : `Run ${data?.run.id ?? "demo"} · ${data?.run.status ?? "mock"}${data?.run.benchTaskId ? ` · ${data.run.benchTaskId}` : ""}`}
          </p>
          {usingMock && (
            <p className="mt-1 text-xs text-amber-300">
              Showing mock data — start control-plane and finish scoring to load real runs.
            </p>
          )}
          {error && !usingMock && (
            <p className="mt-1 text-xs text-red-300">{error}</p>
          )}
        </div>
        <Badge variant="outline">{findings.length} findings</Badge>
      </div>

      <div className="grid gap-4">
        {findings.map((finding) => (
          <FindingCard key={finding.id} finding={finding} />
        ))}
      </div>
    </div>
  );
}

export function LiveRunSummaryStrip() {
  const { data, usingMock } = useLiveRun();

  return (
    <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
      <GitPullRequest className="h-4 w-4" />
      <span>
        {usingMock
          ? "Mock harness audit"
          : `Live: ${data?.run.benchTaskId ?? data?.run.id ?? "harness run"}`}
      </span>
    </div>
  );
}
