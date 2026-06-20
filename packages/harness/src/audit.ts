/**
 * The audit agent — turns a general LLM into a WCAG expert and produces a
 * structured Finding[] for a page.
 *
 * The model gets a curated tool surface (accessibility tree, screen-reader
 * serialization, contrast, focus order, raw DOM, plus submit_finding) and an
 * axe-core scan as starting clues, then reasons about WCAG and records each
 * confirmed violation via submit_finding.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { AxeBuilder } from "@axe-core/playwright";
import { generateText, stepCountIs, tool, type LanguageModel } from "ai";
import { z } from "zod";
import type { Finding, Severity, ViolationType } from "@ramp/shared";
import { formatTree, getAccessibilityTree } from "./a11y-tree.js";
import { closePage, launchPage } from "./browser.js";
import { checkContrast, getFocusOrder } from "./inspectors.js";
import { serializeForScreenReader } from "./screen-reader.js";

export interface AuditInput {
  /** Local repo path (a single HTML file path works too). */
  repo?: string;
  /** Live URL or local HTML file path to audit. */
  url?: string;
  /** Extra context injected into the system prompt (e.g. benchmark hints). */
  hints?: string;
  /** Run id to stamp on each finding (FK into the runs table). */
  runId?: string;
  /** Max agent steps before stopping. Defaults to 25. */
  maxSteps?: number;
}

const SYSTEM_PROMPT = `You are an accessibility (WCAG 2.1 AA) audit expert. You inspect a single web
page using the provided tools and report every real accessibility violation by
calling submit_finding.

Behave like an auditor, not a generic coder:
1. Read the accessibility tree and the screen-reader serialization to hear what
   a blind user actually experiences.
2. Use check_contrast / get_focus_order / query_dom to confirm suspicions.
3. Reason about the WCAG success criterion before recording a finding.
4. Call submit_finding ONCE per distinct violation, with a calibrated
   confidence (0..1) and an evidence string citing what you observed
   (screen-reader output, contrast ratio, missing attribute, etc.).

Focus on these categories (use the exact "type" value):
- missing_alt_text — informative <img> with no alt text. WCAG 1.1.1
  Non-text Content. In the a11y tree these appear as role "image" with an empty
  name. (An intentionally decorative image with alt="" is NOT a violation.)
- low_color_contrast — text whose contrast ratio is below 4.5:1 (3:1 for large
  text). WCAG 1.4.3 Contrast (Minimum). Confirm with check_contrast.
- missing_form_labels — form inputs with no programmatically associated label.
  WCAG 1.3.1 Info and Relationships / 4.1.2. A placeholder is NOT a label (it
  disappears on input), so an input whose only accessible name comes from a
  placeholder still violates this.
- icon_button_accessible_names — buttons/links with only an icon and no
  accessible name. WCAG 4.1.2 Name, Role, Value. In the a11y tree these appear
  as role "button" with an empty name.

You may also report missing_landmarks, heading_structure,
missing_focus_indicator, or keyboard_navigation when clearly warranted.

Severity guidance: critical = blocks a task for a disabled user (no alt on
informative image, icon button with no name); serious = major barrier (low
contrast, missing form label); moderate/minor = lesser issues.

When you have recorded every violation you can confirm, stop. Do not invent
findings you cannot back with evidence from the tools.`;

/**
 * Opt-in precision hardening. When HARNESS_VERIFY=1 the model must prove every
 * finding with the matching tool before submitting, and we drop anything below
 * the confidence floor. Default off so the teammate's leaderboard/control-plane
 * behaviour is unchanged unless a caller (e.g. the bench runner) opts in.
 */
const VERIFY_MODE =
  process.env.HARNESS_VERIFY === "1" || process.env.HARNESS_VERIFY === "true";
const MIN_CONFIDENCE = Number(
  process.env.HARNESS_MIN_CONFIDENCE ?? (VERIFY_MODE ? 0.8 : 0),
);

const VERIFY_PROTOCOL = `

VERIFICATION PROTOCOL (mandatory). Before EACH submit_finding you MUST prove it
with the matching tool and cite the measurement in "evidence". If the tool does
NOT confirm the violation, do not submit it — retract.
- low_color_contrast: call check_contrast on the element's selector; submit ONLY
  if the measured ratio is below 4.5 (3.0 for large text). Put the exact ratio in
  evidence. Do not judge contrast by eye or from hex codes.
- icon_button_accessible_names / missing_alt_text / missing_form_labels: call
  get_accessibility_tree (or query_dom) and confirm the element's accessible name
  is empty/whitespace; submit ONLY if confirmed empty. A placeholder-only textbox
  still counts as empty. Quote the tree node in evidence.
- missing_focus_indicator: call get_focus_order and submit ONLY if a focus stop
  reports no visible indicator.
- heading_structure / missing_landmarks: confirm via get_accessibility_tree
  before submitting.
Only submit findings you are at least 0.8 confident in.`;

const findingSchema = z.object({
  type: z.enum([
    "missing_alt_text",
    "missing_form_labels",
    "icon_button_accessible_names",
    "low_color_contrast",
    "heading_structure",
    "missing_landmarks",
    "missing_focus_indicator",
    "keyboard_navigation",
  ]),
  severity: z.enum(["critical", "serious", "moderate", "minor"]),
  wcagRule: z.string().describe('e.g. "1.1.1 Non-text Content"'),
  domNode: z.string().optional().describe("offending element markup"),
  sourceFile: z.string().optional().describe("best-guess source file"),
  line: z.number().int().optional(),
  confidence: z.number().min(0).max(1),
  autoFixable: z.boolean(),
  evidence: z
    .string()
    .describe("what you observed that proves this (SR output, ratio, etc.)"),
});

function resolveAuditModel(): LanguageModel {
  const provider =
    process.env.RAMP_AUDIT_PROVIDER ??
    (process.env.ANTHROPIC_API_KEY
      ? "anthropic"
      : process.env.OPENAI_API_KEY
        ? "openai"
        : "anthropic");
  const modelName =
    process.env.RAMP_AUDIT_MODEL ??
    (provider === "openai" ? "gpt-4o-mini" : "claude-sonnet-4-6");

  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    return openai(modelName);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return anthropic(modelName);
}

/**
 * Audits a page and returns the violations the harness-equipped model found.
 */
export async function runAudit(input: AuditInput): Promise<Finding[]> {
  const target = input.url ?? input.repo;
  if (!target) throw new Error("runAudit requires `url` or `repo`");
  const runId = input.runId ?? "audit";
  const model = resolveAuditModel();

  const page = await launchPage(target);
  const findings: Finding[] = [];

  try {
    // axe-core scan: machine-detectable issues as starting clues.
    const axe = await new AxeBuilder({ page }).analyze();
    const axeClues =
      axe.violations
        .map(
          (v) =>
            `- ${v.id} [${v.impact ?? "n/a"}]: ${v.help} — nodes: ${v.nodes
              .map((n) => n.target.join(" "))
              .join("; ")}`,
        )
        .join("\n") || "(axe found nothing machine-detectable)";

    const tools = {
      get_accessibility_tree: tool({
        description:
          "Return the page's accessibility tree (roles, names, DOM selectors). Empty names reveal unlabeled controls.",
        inputSchema: z.object({}),
        execute: async () => formatTree(await getAccessibilityTree(page)),
      }),
      get_screen_reader_output: tool({
        description:
          "Return the linear sequence a screen reader announces, one utterance per line.",
        inputSchema: z.object({}),
        execute: async () =>
          serializeForScreenReader(await getAccessibilityTree(page)).join("\n"),
      }),
      check_contrast: tool({
        description:
          "Compute the WCAG contrast ratio for the element matching a CSS selector.",
        inputSchema: z.object({ selector: z.string() }),
        execute: async ({ selector }) =>
          JSON.stringify(await checkContrast(page, selector)),
      }),
      get_focus_order: tool({
        description:
          "Simulate Tab navigation; return ordered focus stops and whether each shows a visible focus indicator.",
        inputSchema: z.object({}),
        execute: async () => JSON.stringify(await getFocusOrder(page)),
      }),
      query_dom: tool({
        description:
          "Return outerHTML of up to 5 elements matching a CSS selector.",
        inputSchema: z.object({ selector: z.string() }),
        execute: async ({ selector }) => {
          try {
            const html = await page.$$eval(selector, (els) =>
              els.slice(0, 5).map((e) => e.outerHTML),
            );
            return html.length ? html.join("\n") : "(no elements matched)";
          } catch (e) {
            return `query_dom error: ${(e as Error).message}`;
          }
        },
      }),
      submit_finding: tool({
        description:
          "Record one confirmed accessibility violation. Call once per distinct violation.",
        inputSchema: findingSchema,
        execute: async (f) => {
          findings.push({
            id: `${runId}-f${findings.length + 1}`,
            runId,
            type: f.type as ViolationType,
            severity: f.severity as Severity,
            wcagRule: f.wcagRule,
            domNode: f.domNode,
            page: target,
            sourceFile: f.sourceFile,
            line: f.line,
            confidence: f.confidence,
            autoFixable: f.autoFixable,
            evidence: f.evidence,
          });
          return `Recorded finding #${findings.length}: ${f.type} (${f.wcagRule}).`;
        },
      }),
    };

    await generateText({
      model,
      maxOutputTokens: 8000,
      stopWhen: stepCountIs(input.maxSteps ?? 25),
      system: (() => {
        const base = VERIFY_MODE ? `${SYSTEM_PROMPT}${VERIFY_PROTOCOL}` : SYSTEM_PROMPT;
        return input.hints
          ? `${base}\n\nAdditional context for this audit:\n${input.hints}`
          : base;
      })(),
      tools,
      prompt:
        `Audit the page at: ${target}\n\n` +
        `axe-core flagged these machine-detectable issues as a starting point ` +
        `(treat as clues, not the full list — explore for more):\n${axeClues}\n\n` +
        `Inspect the page with your tools, reason about WCAG, and call ` +
        `submit_finding for every real violation you confirm.`,
    });
  } finally {
    await closePage(page);
  }

  return findings.filter((finding) => finding.confidence >= MIN_CONFIDENCE);
}
