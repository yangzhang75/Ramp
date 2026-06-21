/**
 * Sandbox checkout for the fix loop.
 *
 * `prepareRepo` shallow-clones a repo into a throwaway temp directory and
 * checks out a specific commit or branch, so the fixer can edit + diff in
 * isolation without touching anything else. The returned `cleanup()` removes
 * the temp directory.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PreparedRepo {
  /** Absolute path to the checked-out working directory. */
  workdir: string;
  /** Resolved HEAD commit sha after checkout. */
  headSha: string;
  /** Removes the temp working directory. */
  cleanup: () => void;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.trim();
}

/**
 * Shallow-clones `repoUrl` and checks out `ref` (a commit sha or branch name).
 *
 * @param repoUrl any git-cloneable URL (https, file://, ...)
 * @param ref     commit sha or branch/tag name
 */
export async function prepareRepo(
  repoUrl: string,
  ref: string,
): Promise<PreparedRepo> {
  const workdir = mkdtempSync(join(tmpdir(), "ramp-fix-"));
  try {
    await git(workdir, ["init", "-q"]);
    await git(workdir, ["remote", "add", "origin", repoUrl]);
    try {
      // Fast path: fetch just the requested ref/sha at depth 1.
      await git(workdir, ["fetch", "--depth", "1", "origin", ref]);
      await git(workdir, ["checkout", "-q", "FETCH_HEAD"]);
    } catch {
      // Fallback: fetch default refs, then check out by name.
      await git(workdir, ["fetch", "--depth", "1", "origin"]);
      await git(workdir, ["checkout", "-q", ref]);
    }
    const headSha = await git(workdir, ["rev-parse", "HEAD"]);
    return {
      workdir,
      headSha,
      cleanup: () => rmSync(workdir, { recursive: true, force: true }),
    };
  } catch (e) {
    rmSync(workdir, { recursive: true, force: true });
    throw e;
  }
}
