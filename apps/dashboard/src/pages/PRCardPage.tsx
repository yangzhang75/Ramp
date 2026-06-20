import { ExternalLink, GitPullRequest, Headphones } from "lucide-react";
import { Badge } from "../components/ui/badge.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { mockPrFallback, usePrCard } from "../hooks/useRampData.js";
import fixOutcomes from "../data/fix-outcomes.json";

function DiffLine({ line }: { line: string }) {
  let className = "text-[var(--color-muted-foreground)]";
  if (line.startsWith("+")) className = "text-green-300";
  else if (line.startsWith("-")) className = "text-red-300";
  else if (line.startsWith("@@")) className = "text-blue-300";

  return <div className={`font-mono text-xs leading-5 ${className}`}>{line}</div>;
}

export function PRCardPage() {
  const {
    data,
    loading,
    error,
    usingMock,
    beforeScore,
    afterScore,
    beforeViolations,
    afterViolations,
  } = usePrCard();

  const pr = data ?? {
    repo: mockPrFallback.repo,
    title: mockPrFallback.title,
    url: mockPrFallback.url,
    branch: mockPrFallback.branch,
    diff: mockPrFallback.diff,
    taskId: "demo",
  };

  const diffLines = pr.diff.split("\n");
  const badHtmlDemo = fixOutcomes.demos.find((d) => d.id === "bad-html");

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[var(--color-primary)]">
          <GitPullRequest className="h-5 w-5" />
          <span className="text-sm font-medium uppercase tracking-wide">
            PR Card
          </span>
        </div>
        <h2 className="text-2xl font-semibold">Fix pull request</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {loading ? "Loading curated fix PR…" : `Bench task ${"taskId" in pr ? pr.taskId : "demo"}`}
        </p>
        {usingMock && (
          <p className="mt-1 text-xs text-amber-300">
            Showing mock PR — control-plane serves real task + diff when available.
          </p>
        )}
        {error && !usingMock && (
          <p className="mt-1 text-xs text-red-300">{error}</p>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{pr.repo}</Badge>
            <Badge variant="outline">{pr.branch}</Badge>
          </div>
          <CardTitle className="text-xl">{pr.title}</CardTitle>
          <CardDescription>
            <a
              href={pr.url}
              className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline"
            >
              View on GitHub
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
              <p className="text-xs uppercase tracking-wide text-red-300">Before</p>
              <p className="mt-2 text-4xl font-bold text-red-300">{beforeScore}</p>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                {beforeViolations} violations
              </p>
            </div>
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
              <p className="text-xs uppercase tracking-wide text-green-300">After</p>
              <p className="mt-2 text-4xl font-bold text-green-300">{afterScore}</p>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                {afterViolations} violations
              </p>
            </div>
          </div>

          {badHtmlDemo && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-4">
                <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-red-300">
                  <Headphones className="h-3.5 w-3.5" />
                  Screen reader — before
                </p>
                <pre className="font-mono text-sm leading-relaxed">
                  {badHtmlDemo.screenReaderBefore.join("\n")}
                </pre>
              </div>
              <div className="rounded-lg border border-green-500/30 bg-green-950/20 p-4">
                <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-green-300">
                  <Headphones className="h-3.5 w-3.5" />
                  Screen reader — after
                </p>
                <pre className="font-mono text-sm leading-relaxed">
                  {badHtmlDemo.screenReaderAfter.join("\n")}
                </pre>
              </div>
            </div>
          )}

          <div>
            <p className="mb-3 text-sm font-medium">Unified diff</p>
            <div className="max-h-[420px] overflow-auto rounded-lg border border-[var(--color-border)] bg-black/30 p-4">
              {diffLines.map((line: string, index: number) => (
                <DiffLine key={`${index}-${line}`} line={line} />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
