import { Activity, GitPullRequest } from "lucide-react";
import type { Finding, Severity } from "@ramp/shared";
import { BackendNotice } from "../components/BackendNotice.js";
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
  const { data, findings, loading, error } = useLiveRun();
  const backendOffline = !loading && !data && Boolean(error);

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
              : data
                ? `Run ${data.run.id} · ${data.run.status}${data.run.benchTaskId ? ` · ${data.run.benchTaskId}` : ""}`
                : "No live run loaded"}
          </p>
          {backendOffline && <BackendNotice className="mt-3" />}
        </div>
        {findings.length > 0 && (
          <Badge variant="outline">{findings.length} findings</Badge>
        )}
      </div>

      {findings.length > 0 ? (
        <div className="grid gap-4">
          {findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} />
          ))}
        </div>
      ) : (
        !loading && (
          <p className="rounded-lg border border-[var(--color-border)] px-4 py-8 text-center text-sm text-[var(--color-muted-foreground)]">
            {backendOffline
              ? "Connect control-plane and run a benchmark harness audit to see live findings here."
              : "No findings in the latest run yet."}
          </p>
        )
      )}
    </div>
  );
}

export function LiveRunSummaryStrip() {
  const { data, loading, error } = useLiveRun();

  return (
    <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
      <GitPullRequest className="h-4 w-4" />
      <span>
        {loading
          ? "Loading live run…"
          : data
            ? `Live: ${data.run.benchTaskId ?? data.run.id}`
            : error
              ? "Control-plane offline"
              : "No live run"}
      </span>
    </div>
  );
}
