import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LeaderboardEntry, LeaderboardFile } from "./leaderboard-types.js";
import { entryKey } from "./leaderboard-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const LEADERBOARD_PATH = join(__dirname, "../data/leaderboard.json");

export function readLeaderboardFile(): LeaderboardFile {
  if (!existsSync(LEADERBOARD_PATH)) {
    return { entries: [] };
  }
  return JSON.parse(readFileSync(LEADERBOARD_PATH, "utf8")) as LeaderboardFile;
}

export function upsertLeaderboardEntry(entry: LeaderboardEntry): LeaderboardFile {
  mkdirSync(dirname(LEADERBOARD_PATH), { recursive: true });
  const file = readLeaderboardFile();
  const key = entryKey(entry);
  const entries = file.entries.filter((row) => entryKey(row) !== key);
  entries.push(entry);
  entries.sort((a, b) => a.label.localeCompare(b.label));
  const next = { entries };
  writeFileSync(LEADERBOARD_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function listLeaderboardRows(file: LeaderboardFile = readLeaderboardFile()) {
  return file.entries.flatMap((entry) => [
    {
      model: entry.label,
      provider: entry.provider,
      modelId: entry.model,
      mode: "naked" as const,
      recall: entry.naked.recall,
      precision: entry.naked.precision,
      tasks: entry.taskCount,
      computedAt: entry.computedAt,
    },
    {
      model: entry.label,
      provider: entry.provider,
      modelId: entry.model,
      mode: "harness" as const,
      recall: entry.harness.recall,
      precision: entry.harness.precision,
      tasks: entry.taskCount,
      computedAt: entry.computedAt,
    },
  ]);
}

export function latestLeaderboardEntry(
  file: LeaderboardFile = readLeaderboardFile(),
): LeaderboardEntry | null {
  if (file.entries.length === 0) return null;
  return [...file.entries].sort((a, b) => b.computedAt.localeCompare(a.computedAt))[0]!;
}
