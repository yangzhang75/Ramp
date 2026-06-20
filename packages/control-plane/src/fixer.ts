/**
 * The fixer: repair ONE accessibility finding via Claude Code headless.
 *
 * `fixOneFinding` runs `claude -p` with its working directory pinned to the
 * sandbox `workdir`, instructs a minimal single-finding edit, then captures the
 * resulting unified diff with `git diff`. It edits one finding at a time.
 *
 * NOTE: this uses Claude Code quota (the `claude` CLI), NOT the paid Anthropic
 * API key — it does not spend topped-up API credits.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Finding } from "@ramp/shared";

const execFileAsync = promisify(execFile);

export interface FixAttempt {
  finding: Finding;
  /** Repo-relative file the finding points at. */
  file: string;
  /** Unified diff of the edit (empty if nothing changed). */
  diff: string;
  changed: boolean;
  /** Short description of how the fix was produced. */
  strategy: string;
  /** Raw claude headless output (for debugging). */
  log: string;
}

function buildPrompt(finding: Finding): string {
  return [
    "You are fixing exactly ONE accessibility violation and nothing else.",
    "",
    `Violation type: ${finding.type}`,
    `WCAG: ${finding.wcagRule}`,
    finding.sourceFile ? `File: ${finding.sourceFile}` : "",
    finding.line ? `Around line: ${finding.line}` : "",
    finding.domNode ? `Offending element: ${finding.domNode}` : "",
    finding.evidence ? `Evidence: ${finding.evidence}` : "",
    "",
    "Apply the smallest possible code change that fixes ONLY this issue, in ONLY this file.",
    "- Prefer semantic HTML and a real accessible name over ARIA hacks.",
    "- Do not reformat the file, do not fix other issues, do not touch other files,",
    "  do not add explanatory comments, do not commit.",
    "After making the single edit, stop.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-c", "core.pager=cat", ...args], {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Repairs a single finding in `workdir` and returns the diff.
 * Assumes `workdir` is a git repo with a clean tree at the base commit.
 */
export async function fixOneFinding(
  workdir: string,
  finding: Finding,
): Promise<FixAttempt> {
  const prompt = buildPrompt(finding);
  const args = [
    "-p",
    prompt,
    "--permission-mode",
    "bypassPermissions",
  ];

  let log = "";
  try {
    const { stdout, stderr } = await execFileAsync("claude", args, {
      cwd: workdir,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 240_000,
    });
    log = `${stdout}\n${stderr}`.trim();
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    log = `${err.stdout ?? ""}\n${err.stderr ?? ""}\n${err.message ?? ""}`.trim();
  }

  const diff = await git(workdir, ["diff", "HEAD"]);
  return {
    finding,
    file: finding.sourceFile ?? "",
    diff,
    changed: diff.trim().length > 0,
    strategy: `claude headless minimal edit for ${finding.type}`,
    log,
  };
}
