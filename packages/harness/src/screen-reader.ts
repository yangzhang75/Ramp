/**
 * Screen-reader serialization — the harness's "ears".
 *
 * Walks the accessibility tree in document order and produces the linear
 * sequence a screen reader would announce. Each item is "role: name (states)";
 * a node with no accessible name collapses to just its role — which is exactly
 * how an unlabeled control sounds to a blind user ("button", "image").
 */
import type { A11yNode } from "./a11y-tree.js";

/** ARIA states worth announcing when present + meaningful. */
const INTERESTING_STATES = [
  "disabled",
  "required",
  "checked",
  "expanded",
  "selected",
  "invalid",
  "pressed",
];

function collectStates(states?: Record<string, unknown>): string | undefined {
  if (!states) return undefined;
  const parts: string[] = [];
  for (const key of INTERESTING_STATES) {
    const v = states[key];
    if (v === true) parts.push(key);
    else if (typeof v === "string" && v && v !== "false") {
      parts.push(`${key}=${v}`);
    }
  }
  return parts.length ? parts.join(", ") : undefined;
}

function formatItem(n: A11yNode): string {
  const base = n.name ? `${n.role}: ${n.name}` : n.role;
  const states = collectStates(n.states);
  return states ? `${base} (${states})` : base;
}

/**
 * Serializes an accessibility tree into the ordered list of utterances a
 * screen reader would produce.
 */
export function serializeForScreenReader(tree: A11yNode[]): string[] {
  const out: string[] = [];

  function walk(nodes: A11yNode[], parentName: string): void {
    for (const n of nodes) {
      // InlineTextBox always duplicates its StaticText parent — never spoken.
      if (n.role === "InlineTextBox") {
        walk(n.children, parentName);
        continue;
      }
      // A StaticText whose text already became an ancestor's accessible name
      // is announced once, not twice.
      const isDuplicateText = n.role === "StaticText" && n.name === parentName;
      if (!isDuplicateText) out.push(formatItem(n));
      walk(n.children, n.name || parentName);
    }
  }

  walk(tree, "");
  return out;
}
