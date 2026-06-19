/**
 * Mine merged accessibility PRs from GitHub and append them to
 * data/candidates.jsonl. Seeds from data/seeds.txt are always included.
 *
 * Usage (from repo root):
 *   pnpm --filter @ramp/bench mine
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Octokit } from "@octokit/rest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const SEEDS_PATH = join(DATA_DIR, "seeds.txt");
const OUTPUT_PATH = join(DATA_DIR, "candidates.jsonl");

const SEARCH_QUERIES = [
  "accessibility is:pr is:merged",
  "a11y is:pr is:merged",
  "aria-label is:pr is:merged",
  '"alt text" is:pr is:merged',
  "wcag is:pr is:merged",
  '"role=" is:pr is:merged',
  '"focus order" is:pr is:merged',
  "contrast is:pr is:merged",
];

const MAX_PER_QUERY = 30;
const MAX_TOTAL = 150;

export interface CandidateRow {
  repo: string;
  pr_number: number;
  base_commit: string;
  fix_commit: string;
  title: string;
  diff: string;
}

function getClient(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is not set. Add it to the repo root .env file.");
  }
  return new Octokit({ auth: token });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      const retryable = err.status === 403 || err.status === 429 || err.status === 502;
      if (!retryable || attempt === maxAttempts - 1) {
        throw error;
      }
      const waitMs = Math.min(60_000, 2 ** attempt * 1_000);
      console.warn(
        `[mine] ${label} rate-limited (${err.status}); retry in ${waitMs}ms`,
      );
      await sleep(waitMs);
    }
  }
  throw new Error(`[mine] ${label} failed after retries`);
}

function parseRepoFromUrl(repositoryUrl: string): string | null {
  const match = repositoryUrl.match(/repos\/([^/]+\/[^/]+)$/);
  return match?.[1] ?? null;
}

function parseSeedLine(line: string): { repo: string; pr_number: number } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const match = trimmed.match(/^([^#]+)#(\d+)$/);
  if (!match) {
    console.warn(`[mine] skipping invalid seed line: ${trimmed}`);
    return null;
  }
  return { repo: match[1]!, pr_number: Number(match[2]) };
}

function loadSeeds(): Array<{ repo: string; pr_number: number }> {
  if (!existsSync(SEEDS_PATH)) return [];
  const lines = readFileSync(SEEDS_PATH, "utf8").split("\n");
  return lines.flatMap((line) => {
    const parsed = parseSeedLine(line);
    return parsed ? [parsed] : [];
  });
}

async function fetchCandidate(
  octokit: Octokit,
  repo: string,
  pr_number: number,
): Promise<CandidateRow | null> {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    console.warn(`[mine] invalid repo: ${repo}`);
    return null;
  }

  const pr = await withRetry(
    () =>
      octokit.rest.pulls.get({
        owner,
        repo: name,
        pull_number: pr_number,
      }),
    `pulls.get ${repo}#${pr_number}`,
  );

  if (!pr.data.merged_at) {
    return null;
  }

  const diffResponse = await withRetry(
    () =>
      octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
        owner,
        repo: name,
        pull_number: pr_number,
        headers: { accept: "application/vnd.github.diff" },
      }),
    `pulls.diff ${repo}#${pr_number}`,
  );

  const diff =
    typeof diffResponse.data === "string"
      ? diffResponse.data
      : JSON.stringify(diffResponse.data);

  return {
    repo,
    pr_number,
    base_commit: pr.data.base.sha,
    fix_commit: pr.data.merge_commit_sha ?? pr.data.head.sha,
    title: pr.data.title,
    diff,
  };
}

async function searchCandidates(
  octokit: Octokit,
): Promise<Array<{ repo: string; pr_number: number }>> {
  const seen = new Set<string>();
  const results: Array<{ repo: string; pr_number: number }> = [];

  for (const query of SEARCH_QUERIES) {
    if (results.length >= MAX_TOTAL) break;

    console.log(`[mine] searching: ${query}`);
    const response = await withRetry(
      () =>
        octokit.rest.search.issuesAndPullRequests({
          q: query,
          sort: "updated",
          order: "desc",
          per_page: MAX_PER_QUERY,
        }),
      `search "${query}"`,
    );

    for (const item of response.data.items) {
      if (!item.pull_request || results.length >= MAX_TOTAL) continue;
      const repo = parseRepoFromUrl(item.repository_url);
      if (!repo) continue;
      const key = `${repo}#${item.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ repo, pr_number: item.number });
    }

    await sleep(1_500);
  }

  return results;
}

function appendCandidate(row: CandidateRow): void {
  appendFileSync(OUTPUT_PATH, `${JSON.stringify(row)}\n`, "utf8");
}

export async function mineCandidates(): Promise<{
  total: number;
  fromSeeds: number;
  fromSearch: number;
  skipped: number;
}> {
  mkdirSync(DATA_DIR, { recursive: true });
  const octokit = getClient();

  const seeds = loadSeeds();
  const searchHits = await searchCandidates(octokit);

  const ordered: Array<{ repo: string; pr_number: number; fromSeed: boolean }> =
    [];
  const seen = new Set<string>();

  for (const seed of seeds) {
    const key = `${seed.repo}#${seed.pr_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push({ ...seed, fromSeed: true });
  }

  for (const hit of searchHits) {
    const key = `${hit.repo}#${hit.pr_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push({ ...hit, fromSeed: false });
  }

  let total = 0;
  let fromSeeds = 0;
  let fromSearch = 0;
  let skipped = 0;

  for (const item of ordered) {
    try {
      const candidate = await fetchCandidate(octokit, item.repo, item.pr_number);
      if (!candidate) {
        skipped++;
        continue;
      }
      appendCandidate(candidate);
      total++;
      if (item.fromSeed) fromSeeds++;
      else fromSearch++;
      console.log(`[mine] + ${item.repo}#${item.pr_number} (${candidate.title})`);
      await sleep(300);
    } catch (error) {
      skipped++;
      console.warn(`[mine] skip ${item.repo}#${item.pr_number}:`, error);
    }
  }

  return { total, fromSeeds, fromSearch, skipped };
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  mineCandidates()
    .then(({ total, fromSeeds, fromSearch, skipped }) => {
      console.log("\n[mine] done");
      console.log(`  total written : ${total}`);
      console.log(`  from seeds    : ${fromSeeds}`);
      console.log(`  from search   : ${fromSearch}`);
      console.log(`  skipped       : ${skipped}`);
      console.log(`  output        : ${OUTPUT_PATH}`);
    })
    .catch((error) => {
      console.error("[mine] failed:", error);
      process.exit(1);
    });
}
