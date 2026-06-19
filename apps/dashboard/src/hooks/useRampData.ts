import { useEffect, useState } from "react";
import {
  fetchBenchmarkLeaderboard,
  fetchBenchmarkScores,
  fetchLiveRun,
  fetchPrCard,
  type BenchmarkLeaderboardRow,
  type BenchmarkModeMetrics,
  type BenchmarkScoresResponse,
  type LiveRunResponse,
  type PrCardResponse,
} from "../lib/api.js";
import {
  mockAfterScore,
  mockBeforeScore,
  mockFindings,
  mockLeaderboard,
  mockModeMetrics,
  mockPullRequest,
} from "../mock-data.js";
import type { Finding } from "@ramp/shared";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  usingMock: boolean;
}

function initialState<T>(): AsyncState<T> {
  return { data: null, loading: true, error: null, usingMock: false };
}

export function useLiveRun(): AsyncState<LiveRunResponse> & { findings: Finding[] } {
  const [state, setState] = useState(initialState<LiveRunResponse>());

  useEffect(() => {
    let cancelled = false;
    fetchLiveRun()
      .then((data) => {
        if (!cancelled) {
          setState({ data, loading: false, error: null, usingMock: false });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : "Failed to load run",
            usingMock: true,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const findings =
    state.data?.findings ??
    mockFindings.map((finding) => ({
      ...finding,
      runId: state.data?.run.id ?? finding.runId,
    }));

  return { ...state, findings };
}

export function useBenchmarkScores(): AsyncState<BenchmarkScoresResponse> & {
  chartData: Array<{ mode: string; recall: number; precision: number }>;
  naked: BenchmarkModeMetrics | null;
  harness: BenchmarkModeMetrics | null;
} {
  const [state, setState] = useState(initialState<BenchmarkScoresResponse>());

  useEffect(() => {
    let cancelled = false;
    fetchBenchmarkScores()
      .then((data) => {
        if (!cancelled) {
          setState({ data, loading: false, error: null, usingMock: false });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : "Failed to load scores",
            usingMock: true,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const naked = state.data?.naked ?? null;
  const harness = state.data?.harness ?? null;
  const chartData =
    naked && harness
      ? [
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
        ]
      : mockModeMetrics.map((row) => ({
          mode: row.mode,
          recall: Math.round(row.recall * 100),
          precision: Math.round(row.precision * 100),
        }));

  return { ...state, chartData, naked, harness };
}

export function useLeaderboard(): AsyncState<BenchmarkLeaderboardRow[]> {
  const [state, setState] = useState(initialState<BenchmarkLeaderboardRow[]>());

  useEffect(() => {
    let cancelled = false;
    fetchBenchmarkLeaderboard()
      .then(({ rows }) => {
        if (!cancelled) {
          setState({ data: rows, loading: false, error: null, usingMock: false });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: mockLeaderboard,
            loading: false,
            error: error instanceof Error ? error.message : "Failed to load leaderboard",
            usingMock: true,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function usePrCard(): AsyncState<PrCardResponse> & {
  beforeScore: number;
  afterScore: number;
  beforeViolations: number;
  afterViolations: number;
} {
  const [state, setState] = useState(initialState<PrCardResponse>());

  useEffect(() => {
    let cancelled = false;
    fetchPrCard("ramp-003")
      .then((data) => {
        if (!cancelled) {
          setState({ data, loading: false, error: null, usingMock: false });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : "Failed to load PR card",
            usingMock: true,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ...state,
    beforeScore: state.data?.beforeScore ?? mockBeforeScore.score,
    afterScore: state.data?.afterScore ?? mockAfterScore.score,
    beforeViolations: state.data?.beforeViolations ?? mockBeforeScore.totalViolations,
    afterViolations: state.data?.afterViolations ?? mockAfterScore.totalViolations,
  };
}

export const mockPrFallback = mockPullRequest;
