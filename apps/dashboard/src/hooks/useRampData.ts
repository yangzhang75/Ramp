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
import type { Finding } from "@ramp/shared";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function initialState<T>(): AsyncState<T> {
  return { data: null, loading: true, error: null };
}

export function useLiveRun(): AsyncState<LiveRunResponse> & { findings: Finding[] } {
  const [state, setState] = useState(initialState<LiveRunResponse>());

  useEffect(() => {
    let cancelled = false;
    fetchLiveRun()
      .then((data) => {
        if (!cancelled) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : "Failed to load run",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ...state,
    findings: state.data?.findings ?? [],
  };
}

export function useBenchmarkScores(): AsyncState<BenchmarkScoresResponse> & {
  chartData: Array<{ mode: string; recall: number; precision: number }>;
  naked: BenchmarkModeMetrics | null;
  harness: BenchmarkModeMetrics | null;
  htmlLive: BenchmarkScoresResponse["htmlLive"];
  taskCounts: BenchmarkScoresResponse["taskCounts"] | null;
} {
  const [state, setState] = useState(initialState<BenchmarkScoresResponse>());

  useEffect(() => {
    let cancelled = false;
    fetchBenchmarkScores()
      .then((data) => {
        if (!cancelled) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : "Failed to load scores",
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
      : [];

  return {
    ...state,
    chartData,
    naked,
    harness,
    htmlLive: state.data?.htmlLive ?? null,
    taskCounts: state.data?.taskCounts ?? null,
  };
}

export function useLeaderboard(): AsyncState<BenchmarkLeaderboardRow[]> {
  const [state, setState] = useState(initialState<BenchmarkLeaderboardRow[]>());

  useEffect(() => {
    let cancelled = false;
    fetchBenchmarkLeaderboard()
      .then(({ rows }) => {
        if (!cancelled) {
          setState({ data: rows, loading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : "Failed to load leaderboard",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function usePrCard(): AsyncState<PrCardResponse> {
  const [state, setState] = useState(initialState<PrCardResponse>());

  useEffect(() => {
    let cancelled = false;
    fetchPrCard("ramp-003")
      .then((data) => {
        if (!cancelled) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : "Failed to load PR card",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
