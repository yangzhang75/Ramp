import { ExternalLink, GitPullRequest } from "lucide-react";
import { Badge } from "../components/ui/badge.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import autoFixData from "../data/auto-fix-results.json";

interface AutoFixDemo {
  id: string;
  repo: string;
  category: string;
  title: string;
  prUrl?: string;
  beforeScore: number | null;
  afterScore: number | null;
  beforeAxeViolations: number | null;
  afterAxeViolations: number | null;
  beforeSemanticIssues?: number;
  afterSemanticIssues?: number;
}

const { tagline, demos } = autoFixData as {
  tagline: string;
  demos: AutoFixDemo[];
};

function ScoreJump({
  before,
  after,
  beforeSemantic,
  afterSemantic,
}: {
  before: number | null;
  after: number | null;
  beforeSemantic?: number;
  afterSemantic?: number;
}) {
  if (beforeSemantic != null && afterSemantic != null) {
    return (
      <div className="flex items-end justify-center gap-3 py-4">
        <span className="text-5xl font-bold text-red-300">{beforeSemantic}</span>
        <span className="pb-2 text-3xl text-[var(--color-muted-foreground)]">→</span>
        <span className="text-5xl font-bold text-[var(--color-primary)]">{afterSemantic}</span>
        <span className="pb-2 text-sm text-[var(--color-muted-foreground)]">semantic</span>
      </div>
    );
  }

  if (before == null || after == null) return null;

  return (
    <div className="flex items-end justify-center gap-3 py-4">
      <span className="text-5xl font-bold text-red-300">{before}</span>
      <span className="pb-2 text-3xl text-[var(--color-muted-foreground)]">→</span>
      <span className="text-5xl font-bold text-[var(--color-primary)]">{after}</span>
    </div>
  );
}

export function AutoFixResultsPage() {
  return (
    <div className="space-y-8">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[var(--color-primary)]">
          <GitPullRequest className="h-5 w-5" />
          <span className="text-sm font-medium uppercase tracking-wide">
            Auto-fix results
          </span>
        </div>
        <h2 className="text-2xl font-semibold md:text-3xl">Real PRs, real score jumps</h2>
        <p className="mt-4 text-xl font-medium text-[var(--color-foreground)] md:text-2xl">
          {tagline}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {demos.map((demo) => (
          <Card
            key={demo.id}
            className="border-[var(--color-border)] bg-[var(--color-card)]/80 transition-colors hover:border-[var(--color-primary)]/40"
          >
            <CardHeader className="space-y-3">
              <Badge variant="secondary" className="w-fit font-mono text-xs">
                {demo.repo.split("/").slice(-1)[0] ?? demo.repo}
              </Badge>
              <CardTitle className="text-lg leading-snug">{demo.title}</CardTitle>
              <CardDescription>{demo.category}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScoreJump
                before={demo.beforeScore}
                after={demo.afterScore}
                beforeSemantic={demo.beforeSemanticIssues}
                afterSemantic={demo.afterSemanticIssues}
              />

              {demo.beforeAxeViolations != null && demo.afterAxeViolations != null ? (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]/40 px-4 py-3 text-center">
                  <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    axe violations
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    <span className="text-red-300">{demo.beforeAxeViolations}</span>
                    <span className="mx-2 text-[var(--color-muted-foreground)]">→</span>
                    <span className="text-[var(--color-primary)]">{demo.afterAxeViolations}</span>
                  </p>
                </div>
              ) : (
                <p className="text-center text-xs text-[var(--color-muted-foreground)]">
                  Score jump from compliance audit (axe counts not primary metric)
                </p>
              )}

              {demo.prUrl ? (
                <a
                  href={demo.prUrl}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-primary)]/50 bg-[var(--color-primary)]/10 px-4 py-3 text-sm font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/20"
                >
                  View PR
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : (
                <p className="text-center text-xs text-[var(--color-muted-foreground)]">
                  Semantic demo — axe stays 0 before and after
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
