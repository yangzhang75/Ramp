/**
 * Leaderboard model registry. Add Claude here once ANTHROPIC_API_KEY is available.
 */
export interface LeaderboardModelConfig {
  provider: "openai" | "anthropic" | "google";
  model: string;
  label: string;
  envKey: string;
}

export const LEADERBOARD_MODELS: LeaderboardModelConfig[] = [
  {
    provider: "openai",
    model: "gpt-4o-mini",
    label: "GPT-4o mini",
    envKey: "OPENAI_API_KEY",
  },
  {
    provider: "openai",
    model: "gpt-4o",
    label: "GPT-4o",
    envKey: "OPENAI_API_KEY",
  },
  // Enable when ANTHROPIC_API_KEY is set:
  // {
  //   provider: "anthropic",
  //   model: "claude-sonnet-4-6",
  //   label: "Claude Sonnet",
  //   envKey: "ANTHROPIC_API_KEY",
  // },
];

export function modelSlug(provider: string, model: string): string {
  return `${provider}-${model.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

export function providerModelKey(provider: string, model: string): string {
  return `${provider}:${model}`;
}
