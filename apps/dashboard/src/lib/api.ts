import type { Finding } from "@ramp/shared";

const API_BASE = import.meta.env.VITE_CONTROL_PLANE_URL ?? "/api";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export interface BenchmarkModeMetrics {
  mode: "naked" | "harness";
  recall: number;
  precision: number;
  expected: number;
  truePositives: number;
  detected: number;
  runId: string;
  computedAt: string;
}

export interface BenchmarkScoresResponse {
  naked: BenchmarkModeMetrics | null;
  harness: BenchmarkModeMetrics | null;
  taskCount: number;
}

export interface BenchmarkLeaderboardRow {
  model: string;
  mode: "naked" | "harness";
  recall: number;
  precision: number;
  tasks: number;
}

export interface LiveRunResponse {
  run: {
    id: string;
    repoUrl: string;
    benchTaskId: string | null;
    status: string;
    createdAt: string;
  };
  findings: Finding[];
}

export interface PrCardResponse {
  taskId: string;
  repo: string;
  title: string;
  url: string;
  branch: string;
  diff: string;
  beforeScore: number;
  afterScore: number;
  beforeViolations: number;
  afterViolations: number;
}

export function fetchBenchmarkScores(): Promise<BenchmarkScoresResponse> {
  return fetchJson("/benchmark/scores");
}

export function fetchBenchmarkLeaderboard(): Promise<{ rows: BenchmarkLeaderboardRow[] }> {
  return fetchJson("/benchmark/leaderboard");
}

export function fetchLiveRun(): Promise<LiveRunResponse> {
  return fetchJson("/benchmark/live-run");
}

export function fetchRun(runId: string): Promise<LiveRunResponse> {
  return fetchJson(`/runs/${encodeURIComponent(runId)}`);
}

export function fetchPrCard(taskId?: string): Promise<PrCardResponse> {
  const query = taskId ? `?taskId=${encodeURIComponent(taskId)}` : "";
  return fetchJson(`/benchmark/pr-card${query}`);
}
