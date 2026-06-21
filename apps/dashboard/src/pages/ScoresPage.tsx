import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Target } from "lucide-react";
import { BackendNotice } from "../components/BackendNotice.js";
import { FixOutcomesSection } from "../components/FixOutcomesSection.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { useBenchmarkScores, useLeaderboard } from "../hooks/useRampData.js";
import type { BenchmarkModeMetrics } from "../lib/api.js";
import complexPrecision from "../data/complex-precision.json";
import { formatPercent } from "../lib/utils.js";

type ScoreView = "html-live" | "all";

interface ComplexPrecisionData {
  status: "pending" | "partial" | "ready";
  runsCompleted?: number;
  runsRequired?: number;
  label: string;
  model: string;
  runsPerMode: number;
  methodology: string;
  naked: {
    recall: number | null;
    precision: number | null;
  };
  harness: {
    recall: number | null;
    precision: number | null;
  };
  computedAt: string | null;
  source: string;
}

const precisionData = complexPrecision as ComplexPrecisionData;

function metricsChart(
  naked: BenchmarkModeMetrics | null,
  harness: BenchmarkModeMetrics | null,
) {
  if (!naked || !harness) return [];
  return [
    {
      mode: "naked",
      recall: Math.round(naked.recall * 100),
      precision: Math.round(naked.precision * 100),
    },
    {
      mode: "harness",
      recall: Math.round(harness.recall * 100),
      precision: Math.round(harness.precision * 100),
    },
  ];
}

function PrecisionHero({
  nakedPrecision,
  harnessPrecision,
  pending,
  partial,
  runsCompleted,
  runsRequired,
}: {
  nakedPrecision: number | null;
  harnessPrecision: number | null;
  pending: boolean;
  partial: boolean;
  runsCompleted?: number;
  runsRequired?: number;
}) {
  if (pending || nakedPrecision == null || harnessPrecision == null) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-6 py-8 text-center">
        <p className="text-sm text-amber-200">
          Complex-page precision run pending — update{" "}
          <span className="font-mono">packages/bench/data/fixture-precision-runs.json</span>{" "}
          after{" "}
          <span className="font-mono">pnpm --filter @ramp/bench score:fixtures</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {partial && runsCompleted != null && runsRequired != null && (
        <p className="text-center text-xs text-amber-300">
          Interim average from run {runsCompleted} of {runsRequired} — re-run twice more, then
          update the JSON files
        </p>
      )}
      <div className="flex flex-wrap items-end justify-center gap-4 py-2">
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Naked precision
          </p>
          <p className="text-5xl font-bold text-red-300">
            {Math.round(nakedPrecision * 100)}%
          </p>
        </div>
        <p className="pb-3 text-2xl text-[var(--color-muted-foreground)]">→</p>
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-[var(--color-primary)]">
            Harness precision
          </p>
          <p className="text-5xl font-bold text-[var(--color-primary)]">
            {Math.round(harnessPrecision * 100)}%
          </p>
        </div>
      </div>
    </div>
  );
}

export function ScoresPage() {
  const {
    chartData: allChartData,
    naked: allNaked,
    harness: allHarness,
    htmlLive,
    taskCounts,
    loading,
    error,
    data,
  } = useBenchmarkScores();
  const leaderboard = useLeaderboard();
  const backendOffline = !loading && !data && Boolean(error);
  const leaderboardOffline = !leaderboard.loading && !leaderboard.data && Boolean(leaderboard.error);

  const hasHtmlLive = Boolean(htmlLive?.naked && htmlLive.harness);
  const [view, setView] = useState<ScoreView>("html-live");

  const activeView: ScoreView =
    view === "html-live" && hasHtmlLive ? "html-live" : "all";

  const naked =
    activeView === "html-live" ? (htmlLive?.naked ?? null) : allNaked;
  const harness =
    activeView === "html-live" ? (htmlLive?.harness ?? null) : allHarness;
  const chartData =
    activeView === "html-live"
      ? metricsChart(htmlLive?.naked ?? null, htmlLive?.harness ?? null)
      : allChartData;
  const activeTaskCount =
    activeView === "html-live"
      ? (htmlLive?.taskCount ?? 0)
      : (data?.taskCount ?? 0);

  const precisionPending = precisionData.status === "pending";
  const precisionPartial = precisionData.status === "partial";

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[var(--color-primary)]">
          <BarChart3 className="h-5 w-5" />
          <span className="text-sm font-medium uppercase tracking-wide">
            Scores
          </span>
        </div>
        <h2 className="text-2xl font-semibold">Outcomes & benchmark</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Fix-loop before/after evidence, then detection metrics on annotated tasks
        </p>
      </div>

      <FixOutcomesSection />

      <Card className="border-[var(--color-primary)]/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-[var(--color-primary)]" />
            Precision on {precisionData.label}
          </CardTitle>
          <CardDescription>{precisionData.methodology}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{precisionData.model}</Badge>
            {precisionData.runsCompleted != null && precisionData.runsRequired != null ? (
              <Badge variant={precisionPartial ? "secondary" : "default"}>
                {precisionData.runsCompleted}/{precisionData.runsRequired} runs
              </Badge>
            ) : (
              <Badge variant="secondary">{precisionData.runsPerMode} runs averaged</Badge>
            )}
            {!precisionPending && precisionData.computedAt && (
              <Badge variant="outline">
                {new Date(precisionData.computedAt).toLocaleDateString()}
              </Badge>
            )}
          </div>
          <PrecisionHero
            nakedPrecision={precisionData.naked.precision}
            harnessPrecision={precisionData.harness.precision}
            pending={precisionPending}
            partial={precisionPartial}
            runsCompleted={precisionData.runsCompleted}
            runsRequired={precisionData.runsRequired}
          />
          {!precisionPending && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-[var(--color-border)] p-4 text-sm">
                <p className="font-medium">Naked</p>
                <p className="mt-1 text-[var(--color-muted-foreground)]">
                  Recall {formatPercent(precisionData.naked.recall ?? 0)} · Precision{" "}
                  {formatPercent(precisionData.naked.precision ?? 0)}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--color-primary)]/30 p-4 text-sm">
                <p className="font-medium">Harness</p>
                <p className="mt-1 text-[var(--color-muted-foreground)]">
                  Recall {formatPercent(precisionData.harness.recall ?? 0)} · Precision{" "}
                  {formatPercent(precisionData.harness.precision ?? 0)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="mb-1 text-lg font-medium">51-task detection benchmark</h3>
        <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
          {loading
            ? "Loading benchmark results…"
            : `${activeView === "html-live" ? "HTML-live subset" : "All tasks"} · ${leaderboard.data?.length ? `${leaderboard.data.length / 2} model(s)` : "latest run"} · ${activeTaskCount} tasks scored`}
        </p>
        {taskCounts && (
          <p className="mb-4 text-xs text-[var(--color-muted-foreground)]">
            Bench mix: {taskCounts.htmlLive} html-live · {taskCounts.sourceCode}{" "}
            source-code · {taskCounts.all} total
          </p>
        )}
        {backendOffline && <BackendNotice className="mb-4" />}
      </div>

      {hasHtmlLive && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={activeView === "html-live" ? "default" : "outline"}
            onClick={() => setView("html-live")}
          >
            HTML-live (fair)
          </Button>
          <Button
            size="sm"
            variant={activeView === "all" ? "default" : "outline"}
            onClick={() => setView("all")}
          >
            All tasks
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Naked vs harness (detection)</CardTitle>
          <CardDescription>
            Recall and precision on the full benchmark — secondary to fix outcomes
            and complex-page precision above
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {chartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={8}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="mode" stroke="#888" />
                  <YAxis domain={[0, 100]} stroke="#888" />
                  <Tooltip
                    contentStyle={{
                      background: "#18181b",
                      border: "1px solid #3f3f46",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="recall" name="Recall" fill="#4ade80" radius={[4, 4, 0, 0]} />
                  <Bar
                    dataKey="precision"
                    name="Precision"
                    fill="#60a5fa"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
              {naked && harness && (
                <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
                  Harness: {harness.truePositives}/{harness.expected} expected hits ·{" "}
                  {harness.detected} reported
                </p>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[var(--color-muted-foreground)]">
              {loading
                ? "Loading benchmark results…"
                : "Connect control-plane to view live 51-task detection metrics."}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leaderboard (mixed tasks)</CardTitle>
          <CardDescription>
            Repo-cloned benchmark runs — use complex-page precision above as the
            headline metric
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {leaderboard.data && leaderboard.data.length > 0 ? (
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-muted-foreground)]">
                  <th className="pb-3 pr-4 font-medium">Model</th>
                  <th className="pb-3 pr-4 font-medium">Mode</th>
                  <th className="pb-3 pr-4 font-medium">Recall</th>
                  <th className="pb-3 pr-4 font-medium">Precision</th>
                  <th className="pb-3 font-medium">Tasks</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.data.map((row) => (
                  <tr
                    key={`${row.model}-${row.mode}`}
                    className="border-b border-[var(--color-border)]/60 last:border-0"
                  >
                    <td className="py-3 pr-4">{row.model}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={row.mode === "harness" ? "default" : "outline"}>
                        {row.mode}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 font-mono">{formatPercent(row.recall)}</td>
                    <td className="py-3 pr-4 font-mono">
                      {formatPercent(row.precision)}
                    </td>
                    <td className="py-3 font-mono">{row.tasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
              {leaderboard.loading
                ? "Loading leaderboard…"
                : leaderboardOffline
                  ? "Connect control-plane to view the live model leaderboard."
                  : "No leaderboard rows yet."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
