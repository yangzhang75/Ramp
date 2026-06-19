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
import { BarChart3, TrendingUp } from "lucide-react";
import { Badge } from "../components/ui/badge.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js";
import { useBenchmarkScores, useLeaderboard } from "../hooks/useRampData.js";
import { formatPercent } from "../lib/utils.js";
import { mockAfterScore, mockBeforeScore } from "../mock-data.js";

export function ScoresPage() {
  const {
    chartData,
    naked,
    harness,
    loading,
    error,
    usingMock,
    data,
  } = useBenchmarkScores();
  const leaderboard = useLeaderboard();

  const beforeScore = harness
    ? Math.round((1 - harness.detected / Math.max(harness.expected, 1)) * 100)
    : mockBeforeScore.score;
  const afterScore = naked
    ? Math.round(naked.recall * 100)
    : mockAfterScore.score;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[var(--color-primary)]">
          <BarChart3 className="h-5 w-5" />
          <span className="text-sm font-medium uppercase tracking-wide">
            Scores
          </span>
        </div>
        <h2 className="text-2xl font-semibold">Detection benchmark</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {loading
            ? "Loading benchmark results…"
            : `Naked vs harness on ${data?.taskCount ?? 0} curated tasks`}
        </p>
        {usingMock && (
          <p className="mt-1 text-xs text-amber-300">
            Showing mock data — run scoring and start control-plane for live numbers.
          </p>
        )}
        {error && !usingMock && (
          <p className="mt-1 text-xs text-red-300">{error}</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-[var(--color-primary)]" />
              Detection recall
            </CardTitle>
            <CardDescription>Harness vs naked recall</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <span className="text-5xl font-bold text-red-300">
                {naked ? Math.round(naked.recall * 100) : beforeScore}
              </span>
              <span className="pb-2 text-2xl text-[var(--color-muted-foreground)]">
                →
              </span>
              <span className="text-5xl font-bold text-[var(--color-primary)]">
                {harness ? Math.round(harness.recall * 100) : afterScore}
              </span>
            </div>
            <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
              Hits {harness?.truePositives ?? 0}/{harness?.expected ?? 0} expected (harness)
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Naked vs harness</CardTitle>
            <CardDescription>Recall and precision (%)</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leaderboard</CardTitle>
          <CardDescription>Latest benchmark run</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
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
              {(leaderboard.data ?? []).map((row) => (
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
        </CardContent>
      </Card>
    </div>
  );
}
