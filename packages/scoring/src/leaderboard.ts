/**
 * Run naked vs harness scoring for each configured leaderboard model.
 *
 * OpenAI models run now. Claude/Gemini entries activate automatically once
 * their API keys are present in .env — uncomment them in leaderboard-models.ts.
 *
 * Usage:
 *   pnpm --filter @ramp/scoring leaderboard
 *   SCORE_LIMIT=3 pnpm --filter @ramp/scoring leaderboard
 */
import { fileURLToPath } from "node:url";
import { LEADERBOARD_MODELS } from "./leaderboard-models.js";
import { listLeaderboardRows, readLeaderboardFile } from "./leaderboard-store.js";
import { scoreBenchmark, type ScoreBenchmarkOptions } from "./score.js";

function hasApiKey(envKey: string): boolean {
  return Boolean(process.env[envKey]?.trim());
}

export async function runLeaderboard(): Promise<void> {
  const runnable = LEADERBOARD_MODELS.filter((config) => {
    if (!hasApiKey(config.envKey)) {
      console.warn(
        `[leaderboard] skip ${config.label} — ${config.envKey} is not set`,
      );
      return false;
    }
    return true;
  });

  if (runnable.length === 0) {
    throw new Error(
      "No leaderboard models are runnable. Set OPENAI_API_KEY in .env first.",
    );
  }

  console.log(`[leaderboard] ${runnable.length} model(s) queued`);

  for (const config of runnable) {
    console.log(`\n[leaderboard] === ${config.label} (${config.provider}/${config.model}) ===`);

    const options: ScoreBenchmarkOptions = {
      provider: config.provider,
      model: config.model,
      modelLabel: config.label,
      runPrefix: "lb",
      writeLeaderboard: true,
    };

    process.env.RAMP_AUDIT_PROVIDER = config.provider;
    process.env.RAMP_AUDIT_MODEL = config.model;

    const { naked, harness } = await scoreBenchmark(options);

    console.log(
      `[leaderboard] ${config.label} naked   recall ${(naked.recall * 100).toFixed(1)}% precision ${(naked.precision * 100).toFixed(1)}%`,
    );
    console.log(
      `[leaderboard] ${config.label} harness recall ${(harness.recall * 100).toFixed(1)}% precision ${(harness.precision * 100).toFixed(1)}%`,
    );
  }

  console.log("\n[leaderboard] done");
  for (const row of listLeaderboardRows(readLeaderboardFile())) {
    console.log(
      `  ${row.model.padEnd(14)} ${row.mode.padEnd(7)} recall ${(row.recall * 100).toFixed(1)}% precision ${(row.precision * 100).toFixed(1)}%`,
    );
  }
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  runLeaderboard().catch((error) => {
    console.error("[leaderboard] failed:", error);
    process.exit(1);
  });
}
