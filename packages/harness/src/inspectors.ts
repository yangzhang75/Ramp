/**
 * Specialized inspectors the audit agent calls as tools:
 *  - checkContrast: computed fg/bg colors → WCAG contrast ratio + AA verdict
 *  - getFocusOrder: simulate Tab navigation → ordered focus stops + whether
 *    each shows a visible focus indicator
 */
import type { Page } from "playwright";

// --- WCAG contrast math -----------------------------------------------------

type RGB = [number, number, number];

function parseColor(s: string): RGB {
  const m = s.match(/rgba?\(([^)]+)\)/i);
  const inner = m?.[1];
  if (!inner) return [0, 0, 0];
  const parts = inner.split(",").map((x) => parseFloat(x.trim()));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function relativeLuminance([r, g, b]: RGB): number {
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(fg: RGB, bg: RGB): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastResult {
  selector: string;
  ratio: number;
  passesAA: boolean;
  /** WCAG AA threshold applied (4.5 normal, 3 large text). */
  threshold: number;
  foreground: string;
  background: string;
  largeText: boolean;
}

/**
 * Computes the WCAG contrast ratio between an element's text color and its
 * effective background (walking up ancestors for the first opaque bg).
 */
export async function checkContrast(
  page: Page,
  selector: string,
): Promise<ContrastResult> {
  const raw = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    let node: HTMLElement | null = el;
    let bg = "rgba(0, 0, 0, 0)";
    while (node) {
      const b = getComputedStyle(node).backgroundColor;
      if (b && b !== "transparent" && !b.startsWith("rgba(0, 0, 0, 0")) {
        bg = b;
        break;
      }
      node = node.parentElement;
    }
    if (bg === "rgba(0, 0, 0, 0)") bg = "rgb(255, 255, 255)"; // assume white page
    return {
      fg: cs.color,
      bg,
      fontSizePx: parseFloat(cs.fontSize) || 16,
      fontWeight: parseInt(cs.fontWeight, 10) || 400,
    };
  }, selector);

  if (!raw) throw new Error(`checkContrast: no element for selector "${selector}"`);

  const largeText =
    raw.fontSizePx >= 24 || (raw.fontWeight >= 700 && raw.fontSizePx >= 18.66);
  const threshold = largeText ? 3 : 4.5;
  const ratio =
    Math.round(contrastRatio(parseColor(raw.fg), parseColor(raw.bg)) * 100) / 100;

  return {
    selector,
    ratio,
    passesAA: ratio >= threshold,
    threshold,
    foreground: raw.fg,
    background: raw.bg,
    largeText,
  };
}

// --- Focus order ------------------------------------------------------------

export interface FocusStop {
  index: number;
  selector: string;
  tag: string;
  text?: string;
  /** Whether the focused element shows a visible focus indicator. */
  hasVisibleFocus: boolean;
}

/**
 * Walks the keyboard tab order, recording each focus stop and whether it has a
 * visible focus indicator. Stops on cycle, reaching <body>, or `max` stops.
 */
export async function getFocusOrder(page: Page, max = 30): Promise<FocusStop[]> {
  const stops: FocusStop[] = [];
  const seen = new Set<string>();

  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });

  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    // NOTE: keep this callback free of named nested functions — esbuild's
    // keepNames (via tsx) injects a `__name` helper that doesn't exist in the
    // page context. Inline the selector computation instead.
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el === document.documentElement) {
        return null;
      }
      const parts: string[] = [];
      let cur: HTMLElement | null = el;
      while (cur && cur.nodeType === 1 && parts.length < 5) {
        let part = cur.tagName.toLowerCase();
        if (cur.id) {
          parts.unshift(`${part}#${cur.id}`);
          break;
        }
        const parent: HTMLElement | null = cur.parentElement;
        if (parent) {
          const tag = cur.tagName;
          const sibs = Array.from(parent.children).filter(
            (c) => c.tagName === tag,
          );
          if (sibs.length > 1) {
            part += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
          }
        }
        parts.unshift(part);
        cur = parent;
      }
      const cs = getComputedStyle(el);
      const hasOutline =
        cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth || "0") > 0;
      const hasShadow = !!cs.boxShadow && cs.boxShadow !== "none";
      return {
        selector: parts.join(" > "),
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? "").trim().slice(0, 40) || undefined,
        hasVisibleFocus: hasOutline || hasShadow,
      };
    });

    if (!info) break;
    if (seen.has(info.selector)) break; // tab order cycled back
    seen.add(info.selector);
    stops.push({ index: i + 1, ...info });
  }

  return stops;
}
