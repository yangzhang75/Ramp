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

/**
 * HTML-focused queries. The `language:HTML` qualifier biases toward repos whose
 * dominant language is HTML (static sites / landing pages), which is where the
 * a11y fix tends to land directly in a Playwright-openable .html page rather
 * than in .tsx/.vue/.css source that the live-page harness can't audit.
 */
const HTML_SEARCH_QUERIES = [
  "accessibility is:pr is:merged language:HTML",
  "a11y is:pr is:merged language:HTML",
  "aria-label is:pr is:merged language:HTML",
  '"alt text" is:pr is:merged language:HTML',
  "alt is:pr is:merged language:HTML",
  "wcag is:pr is:merged language:HTML",
  '"role=" is:pr is:merged language:HTML',
  "contrast is:pr is:merged language:HTML",
  "aria is:pr is:merged language:HTML",
  "screen reader is:pr is:merged language:HTML",
];

/**
 * When MINE_MODE=html, only PRs whose accessibility change lands in a
 * standalone .html page are kept. Extensions in this set mark a PR as
 * "source/template code" the live-page harness can't open, so any PR touching
 * one is rejected even if it also touches .html.
 */
const SOURCE_CODE_EXT =
  /\.(tsx|ts|jsx|js|mjs|cjs|vue|svelte|astro|css|scss|sass|less|styl|dart|py|rb|php|erb|java|kt|go|rs|cs)$/i;
const HTML_EXT = /\.(html?|htm)$/i;

const MINE_MODE = process.env.MINE_MODE ?? "all";
const MAX_PER_QUERY = 30;
const MAX_TOTAL = Number(process.env.MINE_MAX_TOTAL ?? 150);
/** How many result pages to walk per query (GitHub search caps at ~10). */
const MINE_PAGES = Number(process.env.MINE_PAGES ?? 1);
const MINE_SORT = (process.env.MINE_SORT ?? "updated") as
  | "updated"
  | "created"
  | "comments";
const MINE_ORDER = (process.env.MINE_ORDER ?? "desc") as "asc" | "desc";

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

/** Extracts the post-image (b/) paths of every file touched by a unified diff. */
function changedFiles(diff: string): string[] {
  return [...diff.matchAll(/^diff --git a\/\S+ b\/(\S+)/gm)].map((m) => m[1]!);
}

/**
 * True when the PR's change is confined to standalone .html page(s): at least
 * one .html file is touched and no source/template code file is touched.
 * Non-page companions (markdown, json, images, txt) are tolerated since the
 * a11y finding will be annotated against the .html page, not those files.
 */
function isPureHtmlDiff(diff: string): boolean {
  const files = changedFiles(diff);
  if (files.length === 0) return false;
  if (!files.some((f) => HTML_EXT.test(f))) return false;
  if (files.some((f) => SOURCE_CODE_EXT.test(f))) return false;
  return true;
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

  const queries = MINE_MODE === "html" ? HTML_SEARCH_QUERIES : SEARCH_QUERIES;
  for (const query of queries) {
    if (results.length >= MAX_TOTAL) break;

    for (let page = 1; page <= MINE_PAGES; page++) {
      if (results.length >= MAX_TOTAL) break;

      console.log(`[mine] searching: ${query} (page ${page}/${MINE_PAGES})`);
      const response = await withRetry(
        () =>
          octokit.rest.search.issuesAndPullRequests({
            q: query,
            sort: MINE_SORT,
            order: MINE_ORDER,
            per_page: MAX_PER_QUERY,
            page,
          }),
        `search "${query}" p${page}`,
      );

      if (response.data.items.length === 0) break;

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

  console.log(
    `[mine] mode=${MINE_MODE}${MINE_MODE === "html" ? " (pure-HTML PRs only)" : ""}`,
  );

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
      if (MINE_MODE === "html" && !isPureHtmlDiff(candidate.diff)) {
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
