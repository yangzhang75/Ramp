/**
 * Persisted leaderboard entries for the dashboard API.
 */
import type { DetectionMetrics } from "./score.js";

export interface LeaderboardEntry {
  provider: string;
  model: string;
  label: string;
  taskCount: number;
  computedAt: string;
  naked: DetectionMetrics;
  harness: DetectionMetrics;
}

export interface LeaderboardFile {
  entries: LeaderboardEntry[];
}

export function entryKey(entry: Pick<LeaderboardEntry, "provider" | "model">): string {
  return `${entry.provider}:${entry.model}`;
}
