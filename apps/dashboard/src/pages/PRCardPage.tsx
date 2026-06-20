import { ExternalLink, GitPullRequest, Headphones } from "lucide-react";
import { BackendNotice } from "../components/BackendNotice.js";
import { Badge } from "../components/ui/badge.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { usePrCard } from "../hooks/useRampData.js";
import autoFixResults from "../data/auto-fix-results.json";
import fixOutcomes from "../data/fix-outcomes.json";

function DiffLine({ line }: { line: string }) {
  let className = "text-[var(--color-muted-foreground)]";
  if (line.startsWith("+")) className = "text-green-300";
  else if (line.startsWith("-")) className = "text-red-300";
  else if (line.startsWith("@@")) className = "text-blue-300";

  return <div className={`font-mono text-xs leading-5 ${className}`}>{line}</div>;
}

const badHtmlDemo = fixOutcomes.demos.find((d) => d.id === "bad-html");
const badHtmlCard = autoFixResults.demos.find((d) => d.id === "bad-html");

export function PRCardPage() {
  const { data, loading, error } = usePrCard();
  const backendOffline = !loading && !data && Boolean(error);

  const pr = data ?? (badHtmlCard && badHtmlDemo
    ? {
        repo: badHtmlCard.repo,
        title: badHtmlCard.title,
        url: badHtmlCard.prUrl ?? "",
        branch: "ramp/fix-bad-html",
        diff: "",
        taskId: "bad-html",
      }
    : null);

  const beforeScore = data?.beforeScore ?? badHtmlDemo?.beforeScore ?? null;
  const afterScore = data?.afterScore ?? badHtmlDemo?.afterScore ?? null;
  const beforeViolations =
    data?.beforeViolations ?? badHtmlDemo?.beforeAxeViolations ?? null;
  const afterViolations = data?.afterViolations ?? badHtmlDemo?.afterAxeViolations ?? null;

  if (!pr) {
    return (
      <div className="space-y-6">
        <BackendNotice />
      </div>
    );
  }

  const diffLines = pr.diff ? pr.diff.split("\n") : [];

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
          {loading
            ? "Loading curated fix PR…"
            : data
              ? `Live bench task ${"taskId" in pr ? pr.taskId : ""}`
              : "Verified bad.html demo PR (static data)"}
        </p>
        {backendOffline && <BackendNotice className="mt-3" />}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{pr.repo}</Badge>
            <Badge variant="outline">{pr.branch}</Badge>
            {!data && (
              <Badge variant="outline">Static demo · PR #{7}</Badge>
            )}
          </div>
          <CardTitle className="text-xl">{pr.title}</CardTitle>
          <CardDescription>
            {pr.url ? (
              <a
                href={pr.url}
                className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline"
              >
                View on GitHub
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              "No PR URL"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {beforeScore != null && afterScore != null && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                <p className="text-xs uppercase tracking-wide text-red-300">Before</p>
                <p className="mt-2 text-4xl font-bold text-red-300">{beforeScore}</p>
                {beforeViolations != null && (
                  <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                    {beforeViolations} violations
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                <p className="text-xs uppercase tracking-wide text-green-300">After</p>
                <p className="mt-2 text-4xl font-bold text-green-300">{afterScore}</p>
                {afterViolations != null && (
                  <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                    {afterViolations} violations
                  </p>
                )}
              </div>
            </div>
          )}

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
            {diffLines.length > 0 ? (
              <div className="max-h-[420px] overflow-auto rounded-lg border border-[var(--color-border)] bg-black/30 p-4">
                {diffLines.map((line: string, index: number) => (
                  <DiffLine key={`${index}-${line}`} line={line} />
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/20 px-4 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
                Live diff loads from control-plane. Open the GitHub PR above for the verified
                bad.html fix (60 → 96).
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
