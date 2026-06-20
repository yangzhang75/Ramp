import { CheckCircle2, Scale, Sparkles, XCircle } from "lucide-react";
import { Badge } from "../components/ui/badge.js";
import report from "../data/vs-axe-report.json";

interface SemanticIssue {
  selector: string;
  kind: string;
  name: string;
  meaningful: boolean;
  reason: string;
  suggestion: string;
  domNode?: string;
}

interface VsAxePageEntry {
  label: string;
  target: string;
  axe: { count: number; violations: unknown[] };
  ramp: {
    axeCount: number;
    semanticReviewed: number;
    semanticIssues: SemanticIssue[];
  };
  headline: string;
}

interface VsAxeReport {
  generatedFor?: string;
  pages: VsAxePageEntry[];
  totals: {
    pages: number;
    axeIssues: number;
    semanticIssuesAxeMissed: number;
  };
  headline: string;
}

const data = report as VsAxeReport;
const axeCount = data.totals.axeIssues;
const totalIssues = data.totals.semanticIssuesAxeMissed;

function fixtureName(target: string): string {
  return target.split("/").pop() ?? target;
}

function elementLabel(issue: SemanticIssue): string {
  switch (issue.kind) {
    case "alt":
      return `Image · ${issue.name}`;
    case "button-name":
      return `Button · ${issue.name}`;
    case "link-text":
      return `Link · ${issue.name}`;
    default:
      return issue.name;
  }
}

function IssueCard({ issue }: { issue: SemanticIssue }) {
  return (
    <div className="rounded-xl border border-[var(--color-primary)]/35 bg-[var(--color-primary)]/8 p-5 shadow-lg shadow-[var(--color-primary)]/5">
      <p className="text-lg font-semibold">{elementLabel(issue)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline" className="text-zinc-400">
          axe: PASS
        </Badge>
        <Badge variant="critical">
          <XCircle className="mr-1 h-3 w-3" />
          Ramp: NOT MEANINGFUL
        </Badge>
      </div>
      <p className="mt-3 text-base text-[var(--color-muted-foreground)]">{issue.reason}</p>
      <div className="mt-4 rounded-lg border border-green-800/50 bg-green-950/30 px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-green-400/80">Ramp fix</p>
        <p className="mt-1 text-base font-medium text-green-300">
          {JSON.stringify(issue.name)} → {JSON.stringify(issue.suggestion)}
        </p>
      </div>
    </div>
  );
}

export function VsAxePage() {
  return (
    <div className="space-y-8">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[var(--color-primary)]">
          <Scale className="h-5 w-5" />
          <span className="text-sm font-medium uppercase tracking-wide">
            axe vs Ramp
          </span>
        </div>
        <h2 className="text-2xl font-semibold md:text-3xl">Same pages, two verdicts</h2>
        {data.generatedFor && (
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{data.generatedFor}</p>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-10 text-center md:px-10">
        <p className="text-2xl font-bold leading-snug tracking-tight md:text-4xl lg:text-5xl">
          Same pages.{" "}
          <span className="text-zinc-500">axe: {axeCount} issues found.</span>
          <span className="mx-2 text-zinc-600">·</span>
          <span className="text-[var(--color-primary)]">
            Ramp: {totalIssues} issues axe can&apos;t see.
          </span>
        </p>
        <p className="mt-3 text-sm text-[var(--color-muted-foreground)] md:text-base">
          {data.headline}
        </p>
      </div>

      <div className="grid overflow-hidden rounded-2xl border border-[var(--color-border)] lg:grid-cols-2 lg:divide-x lg:divide-[var(--color-border)]">
        <section className="bg-zinc-950/80 p-6 md:p-8 lg:p-10">
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">
            axe-core (industry standard)
          </p>
          <div className="mt-8 flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 className="h-20 w-20 text-green-500/90" strokeWidth={1.5} />
            <p className="mt-6 text-7xl font-bold text-green-400 md:text-8xl">{axeCount}</p>
            <p className="mt-2 text-xl text-zinc-400">issues across {data.totals.pages} pages</p>
            <p className="mt-6 max-w-sm text-lg text-zinc-500">
              Every page passes — axe considers these sites perfect.
            </p>
          </div>
        </section>

        <section className="bg-gradient-to-br from-[var(--color-card)] to-[var(--color-primary)]/10 p-6 md:p-8 lg:p-10">
          <p className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-[var(--color-primary)]">
            <Sparkles className="h-4 w-4" />
            Ramp semantic review
          </p>
          <div className="mt-4 flex items-baseline gap-3">
            <p className="text-6xl font-bold text-[var(--color-primary)] md:text-7xl">
              {totalIssues}
            </p>
            <p className="text-xl text-[var(--color-primary)]/80">semantic issues</p>
          </div>
          <p className="mt-2 text-base text-[var(--color-muted-foreground)]">
            Each with a concrete fix — axe never flagged them.
          </p>

          <div className="mt-8 space-y-8">
            {data.pages.map((page) => (
              <div key={page.label}>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-semibold">{page.label}</h3>
                  <Badge variant="outline" className="font-mono text-xs">
                    {fixtureName(page.target)}
                  </Badge>
                  <Badge variant="secondary">
                    {page.ramp.semanticIssues.length} issues
                  </Badge>
                </div>
                <div className="space-y-4">
                  {page.ramp.semanticIssues.map((issue) => (
                    <IssueCard key={`${page.label}-${issue.selector}`} issue={issue} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
