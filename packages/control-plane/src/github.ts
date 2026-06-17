/**
 * GitHub PR pipeline. The "soul" action of Ramp: turn fixes into a
 * merge-ready pull request.
 *
 * Auth + target come from the environment:
 *  - GITHUB_TOKEN        a token with write access (classic: `repo`;
 *                        fine-grained: Contents + Pull requests = Read/Write)
 *  - GITHUB_TARGET_REPO  "owner/repo" of the repository to open the PR against
 */
import { Octokit } from "@octokit/rest";

export interface OpenPrOptions {
  /** New branch to create the commit + PR on. */
  branch: string;
  /** Repo-relative path of the file to create or update. */
  filePath: string;
  /** Full new contents of the file. */
  newContent: string;
  /** PR title (also used as the commit message). */
  title: string;
  /** PR body (markdown). */
  body?: string;
}

interface ErrorLike {
  status?: number;
  message?: string;
}

function asError(e: unknown): ErrorLike {
  return (e ?? {}) as ErrorLike;
}

/** Parses GITHUB_TARGET_REPO into { owner, repo }. Throws if malformed. */
export function parseTargetRepo(): { owner: string; repo: string } {
  const target = process.env.GITHUB_TARGET_REPO;
  if (!target) {
    throw new Error(
      "GITHUB_TARGET_REPO is not set (expected format: owner/repo)",
    );
  }
  const parts = target.split("/");
  const owner = parts[0];
  const repo = parts[1];
  if (parts.length !== 2 || !owner || !repo) {
    throw new Error(
      `GITHUB_TARGET_REPO must be "owner/repo", got: "${target}"`,
    );
  }
  return { owner, repo };
}

function getClient(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  return new Octokit({ auth: token });
}

export interface PreflightResult {
  ok: boolean;
  tokenPresent: boolean;
  repo: string;
  defaultBranch?: string;
  canPush?: boolean;
  /** Human-readable explanation when ok === false. */
  reason?: string;
}

/**
 * Verifies, before doing any writes, that:
 *  - GITHUB_TOKEN exists
 *  - the token can see GITHUB_TARGET_REPO
 *  - the token has push permission (required to open a PR from a branch)
 *
 * Never throws for permission problems — it returns a structured result with a
 * precise reason (token scope vs. fork/collaborator), so callers can fail loud.
 */
export async function preflight(): Promise<PreflightResult> {
  const tokenPresent = Boolean(process.env.GITHUB_TOKEN);

  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = parseTargetRepo());
  } catch (e) {
    return {
      ok: false,
      tokenPresent,
      repo: process.env.GITHUB_TARGET_REPO ?? "(unset)",
      reason: asError(e).message ?? "Invalid GITHUB_TARGET_REPO",
    };
  }
  const fullName = `${owner}/${repo}`;

  if (!tokenPresent) {
    return {
      ok: false,
      tokenPresent: false,
      repo: fullName,
      reason:
        "GITHUB_TOKEN is missing. Export a token with write access before running.",
    };
  }

  const octokit = getClient();
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    const canPush = Boolean(data.permissions?.push);
    if (!canPush) {
      const reason = data.fork
        ? `No push permission on ${fullName}. It is a fork — set GITHUB_TARGET_REPO to a repo you can push to (your own fork or the upstream you own).`
        : `No push permission on ${fullName}. Either the token lacks write scope ` +
          `(classic token needs the "repo" scope; fine-grained needs Contents + Pull requests = Read/Write), ` +
          `or this account is not a collaborator. If you don't own ${fullName}, fork it and point GITHUB_TARGET_REPO at your fork.`;
      return {
        ok: false,
        tokenPresent: true,
        repo: fullName,
        defaultBranch: data.default_branch,
        canPush: false,
        reason,
      };
    }
    return {
      ok: true,
      tokenPresent: true,
      repo: fullName,
      defaultBranch: data.default_branch,
      canPush: true,
    };
  } catch (e) {
    const err = asError(e);
    let reason: string;
    switch (err.status) {
      case 401:
        reason =
          "401 Unauthorized — GITHUB_TOKEN is invalid/expired or missing required scope.";
        break;
      case 403:
        reason =
          "403 Forbidden — token lacks permission (missing scope) or is rate-limited.";
        break;
      case 404:
        reason = `404 Not Found — ${fullName} doesn't exist, or the token can't see it (private repo + missing "repo" scope). Check GITHUB_TARGET_REPO and the token scope.`;
        break;
      default:
        reason = `Could not read ${fullName}: ${err.message ?? "unknown error"}`;
    }
    return { ok: false, tokenPresent: true, repo: fullName, reason };
  }
}

/**
 * Opens a pull request that creates/updates a single file.
 *
 * Flow: read default branch HEAD → create `branch` from it → create or update
 * `filePath` with `newContent` (one commit) → open a PR back to the default
 * branch. Returns the PR's html_url.
 *
 * Handles "file already exists" (update with its blob sha) vs. "missing"
 * (create) and "branch already exists" (reuse) idempotently.
 */
export async function openPr(opts: OpenPrOptions): Promise<string> {
  const octokit = getClient();
  const { owner, repo } = parseTargetRepo();

  // 1. Default branch + its latest commit sha.
  const repoInfo = await octokit.rest.repos.get({ owner, repo });
  if (!repoInfo.data.permissions?.push) {
    throw new Error(
      `No push permission on ${owner}/${repo}. Run preflight() for the precise cause.`,
    );
  }
  const base = repoInfo.data.default_branch;
  const baseRef = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${base}`,
  });
  const baseSha = baseRef.data.object.sha;

  // 2. Create the new branch (reuse if it already exists).
  try {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${opts.branch}`,
      sha: baseSha,
    });
  } catch (e) {
    if (asError(e).status !== 422) throw e; // 422 = ref already exists
  }

  // 3. Create or update the file on the branch (one commit).
  let existingSha: string | undefined;
  try {
    const existing = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: opts.filePath,
      ref: opts.branch,
    });
    if (!Array.isArray(existing.data) && "sha" in existing.data) {
      existingSha = existing.data.sha;
    }
  } catch (e) {
    if (asError(e).status !== 404) throw e; // 404 = file doesn't exist → create
  }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: opts.filePath,
    message: opts.title,
    content: Buffer.from(opts.newContent, "utf8").toString("base64"),
    branch: opts.branch,
    sha: existingSha,
  });

  // 4. Open the PR back to the default branch.
  const pr = await octokit.rest.pulls.create({
    owner,
    repo,
    head: opts.branch,
    base,
    title: opts.title,
    body: opts.body ?? "",
  });

  return pr.data.html_url;
}
