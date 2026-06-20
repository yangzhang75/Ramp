/**
 * Fix verification (free — axe-core only, no runAudit, no paid API).
 *
 * After a patch is applied in the sandbox, re-run axe-core on the changed file
 * and confirm the targeted violation is gone and no new violations appeared.
 * Optionally run a build command. Assembles a shared FixResult.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { axeScan, type AxeViolationSummary } from "@ramp/harness";
import type { FixResult, FixStatus } from "@ramp/shared";

const execFileAsync = promisify(execFile);

/** Maps a Ramp ViolationType to the axe-core rule id that detects it. */
export const AXE_RULE_FOR_TYPE: Record<string, string> = {
  missing_alt_text: "image-alt",
  icon_button_accessible_names: "button-name",
  missing_form_labels: "label",
  low_color_contrast: "color-contrast",
  missing_landmarks: "region",
  heading_structure: "heading-order",
  missing_focus_indicator: "focus-order-semantics",
};

export interface VerifyFixInput {
  runId: string;
  findingId: string;
  type: string;
  file: string;
  diff: string;
  strategy: string;
  /** Path/URL of the patched file to re-scan. */
  targetUrl: string;
  /** axe rule ids present BEFORE the fix (from the audit/baseline scan). */
  beforeRuleIds: string[];
  /** Optional build command run in `cwd`; skipped when absent. */
  buildCmd?: string;
  cwd?: string;
}

export interface VerifyResult {
  result: FixResult;
  before: string[];
  after: AxeViolationSummary[];
}

export async function verifyFix(input: VerifyFixInput): Promise<VerifyResult> {
  const after = await axeScan(input.targetUrl);
  const afterIds = after.map((v) => v.id);
  const targetRule = AXE_RULE_FOR_TYPE[input.type];

  const targetGone = targetRule ? !afterIds.includes(targetRule) : true;
  const newViolations = afterIds.filter((id) => !input.beforeRuleIds.includes(id));

  // Optional build check.
  let buildOk = true;
  let buildNote = "no build step (static HTML)";
  if (input.buildCmd) {
    try {
      const [cmd, ...args] = input.buildCmd.split(" ");
      await execFileAsync(cmd!, args, {
        cwd: input.cwd,
        maxBuffer: 32 * 1024 * 1024,
      });
      buildNote = "build passed";
    } catch (e) {
      buildOk = false;
      buildNote = `build failed: ${(e as Error).message.split("\n")[0]}`;
    }
  }

  const validated = targetGone && newViolations.length === 0 && buildOk;
  const status: FixStatus = !targetGone
    ? "failed"
    : newViolations.length > 0 || !buildOk
      ? "needs_human_review"
      : "fixed";

  const notes = [
    targetRule
      ? `axe '${targetRule}': ${targetGone ? "resolved" : "STILL PRESENT"}`
      : `no axe rule mapped for ${input.type}`,
    newViolations.length
      ? `new violations: ${newViolations.join(", ")}`
      : "no new violations",
    buildNote,
  ].join("; ");

  return {
    before: input.beforeRuleIds,
    after,
    result: {
      id: `${input.runId}-fix-${input.findingId}`,
      runId: input.runId,
      findingId: input.findingId,
      status,
      file: input.file,
      diff: input.diff,
      strategy: input.strategy,
      validated,
      notes,
    },
  };
}
