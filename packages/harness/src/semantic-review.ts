/**
 * Semantic-quality review — the one thing axe-core CANNOT do.
 *
 * axe only checks whether an accessible NAME EXISTS (alt present, aria-label
 * present). It cannot tell whether that name is MEANINGFUL: `alt="image"`,
 * `aria-label="button"`, and link text "click here" all PASS axe but are
 * useless to a screen-reader user.
 *
 * This module is fully isolated — it does NOT import or touch audit.ts /
 * runAudit. It extracts elements that already have a name (free, in-page), then
 * asks a small model to judge each name's quality.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { closePage, launchPage } from "./browser.js";

export type SemanticKind = "alt" | "button-name" | "link-text";

export interface SemanticIssue {
  selector: string;
  kind: SemanticKind;
  /** The actual accessible name found on the element. */
  name: string;
  /** False when the name is present but semantically empty/unhelpful. */
  meaningful: boolean;
  reason: string;
  /** A better name the fixer can apply. */
  suggestion: string;
  /** Outer HTML snippet (for the fixer / evidence). */
  domNode?: string;
}

interface Candidate {
  kind: SemanticKind;
  selector: string;
  name: string;
  domNode: string;
}

const RUBRIC = `You are an accessibility expert judging whether an EXISTING accessible name is
semantically meaningful to a screen-reader user. The name already exists (axe
would pass it) — your job is quality, not presence.

Judge meaningful:false when the name is present but unhelpful:
- alt text that is a placeholder word ("image", "img", "photo", "picture"),
  a filename ("DSC_0042.JPG", "img001.png"), or empty/whitespace.
- a button name that is generic ("button", "click", "submit" with no object) or empty.
- link text that doesn't say where it goes ("click here", "read more", "here",
  "this", "link", "more").

Judge meaningful:true when the name conveys real purpose/content:
- alt="Acme company logo", alt="Bar chart of Q3 revenue by region"
- button "Search", button "Add to cart"
- link "Download the 2024 annual report"

For every candidate return: selector (echo exactly), kind (echo), name (echo),
meaningful, a short reason, and \`suggestion\` = a CONCRETE literal replacement
name to use (NOT advice like "add descriptive text"). Infer it from page context
(headings, nearby text, the link's href). Examples: alt="image" on a logo →
suggestion "Acme company logo"; link "click here" to /annual-report-2024.pdf →
"Download the 2024 annual report"; button "button" with a search icon → "Search".
For meaningful:true items, suggestion may repeat the existing good name.`;

const reviewSchema = z.object({
  items: z.array(
    z.object({
      selector: z.string(),
      kind: z.enum(["alt", "button-name", "link-text"]),
      name: z.string(),
      meaningful: z.boolean(),
      reason: z.string(),
      suggestion: z.string(),
    }),
  ),
});

function resolveModel(): LanguageModel {
  const provider =
    process.env.RAMP_AUDIT_PROVIDER ??
    (process.env.OPENAI_API_KEY
      ? "openai"
      : process.env.ANTHROPIC_API_KEY
        ? "anthropic"
        : "openai");
  const model =
    process.env.RAMP_SEMANTIC_MODEL ??
    process.env.RAMP_AUDIT_MODEL ??
    (provider === "openai" ? "gpt-4o-mini" : "claude-sonnet-4-6");
  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
    return openai(model);
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  return anthropic(model);
}

/** Extracts named elements (free, in-page). Inline selectors — no nested named fns. */
async function collectNamedElements(target: string): Promise<Candidate[]> {
  const page = await launchPage(target);
  try {
    const raw = await page.evaluate(() => {
      const out: Array<{ kind: string; selector: string; name: string; domNode: string }> = [];
      let i = 0;
      for (const img of Array.from(document.querySelectorAll("img[alt]"))) {
        const alt = (img.getAttribute("alt") ?? "").trim();
        if (!alt) continue; // alt="" = decorative, intentional — not in scope
        const id = String(i++);
        img.setAttribute("data-ramp-sem", id);
        out.push({ kind: "alt", selector: `[data-ramp-sem="${id}"]`, name: alt, domNode: img.outerHTML.slice(0, 200) });
      }
      for (const b of Array.from(document.querySelectorAll("button, [role=button]"))) {
        const name = (b.getAttribute("aria-label") ?? b.textContent ?? "").trim();
        if (!name) continue; // no name = axe/runAudit territory, not semantic quality
        const id = String(i++);
        b.setAttribute("data-ramp-sem", id);
        out.push({ kind: "button-name", selector: `[data-ramp-sem="${id}"]`, name, domNode: (b as HTMLElement).outerHTML.slice(0, 200) });
      }
      for (const a of Array.from(document.querySelectorAll("a[href]"))) {
        const name = (a.getAttribute("aria-label") ?? a.textContent ?? "").trim();
        if (!name) continue;
        const id = String(i++);
        a.setAttribute("data-ramp-sem", id);
        out.push({ kind: "link-text", selector: `[data-ramp-sem="${id}"]`, name, domNode: (a as HTMLElement).outerHTML.slice(0, 200) });
      }
      return out;
    });
    return raw as Candidate[];
  } finally {
    await closePage(page);
  }
}

/**
 * Reviews the semantic quality of every element that already has an accessible
 * name on `target` (a URL or local HTML file). Returns one judgment per element.
 */
export async function reviewSemanticQuality(target: string): Promise<SemanticIssue[]> {
  const candidates = await collectNamedElements(target);
  if (candidates.length === 0) return [];

  const model = resolveModel();
  const { object } = await generateObject({
    model,
    schema: reviewSchema,
    system: RUBRIC,
    prompt:
      `Judge each candidate. Echo selector/kind/name exactly so results align.\n\n` +
      `Candidates:\n${JSON.stringify(candidates.map((c) => ({ selector: c.selector, kind: c.kind, name: c.name })), null, 2)}`,
  });

  const bySelector = new Map(candidates.map((c) => [c.selector, c]));
  return object.items.map((it) => ({
    ...it,
    domNode: bySelector.get(it.selector)?.domNode,
  }));
}
