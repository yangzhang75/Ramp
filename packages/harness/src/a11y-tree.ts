/**
 * Accessibility tree extraction — the harness's core perception.
 *
 * We use the Chrome DevTools Protocol `Accessibility.getFullAXTree` (richer
 * than Playwright's `accessibility.snapshot()`), then enrich each node with
 * DOM locator info (tag / key attributes / a best-effort CSS selector) via
 * `DOM.describeNode`. Ignored nodes are flattened away so the tree reflects
 * what a screen reader actually exposes.
 */
import type { Page } from "playwright";

export interface A11yNode {
  /** ARIA role as exposed to assistive tech (e.g. "button", "image"). */
  role: string;
  /** Computed accessible name. EMPTY means a screen reader hears nothing. */
  name: string;
  /** Interesting ARIA states/properties (focusable, disabled, ...). */
  states?: Record<string, unknown>;
  /** Lowercased DOM tag, when resolvable. */
  tag?: string;
  /** Best-effort CSS selector for locating the source node. */
  selector?: string;
  /** Key DOM attributes (id, class, src, type, ...). */
  attributes?: Record<string, string>;
  children: A11yNode[];
}

// --- Minimal CDP shapes (Playwright's protocol types aren't re-exported). ---
interface AXValue {
  value?: unknown;
}
interface AXProperty {
  name: string;
  value?: AXValue;
}
interface AXNodeRaw {
  nodeId: string;
  ignored?: boolean;
  role?: AXValue;
  name?: AXValue;
  properties?: AXProperty[];
  childIds?: string[];
  parentId?: string;
  backendDOMNodeId?: number;
}

interface DomNodeRaw {
  nodeName?: string;
  attributes?: string[];
}

function buildSelector(tag: string, attrs: Record<string, string>): string {
  const id = attrs["id"];
  if (id) return `${tag}#${id}`;
  const cls = attrs["class"]?.trim().split(/\s+/).filter(Boolean)[0];
  if (cls) return `${tag}.${cls}`;
  return tag;
}

/**
 * Returns the page's accessibility tree as structured, locator-enriched nodes.
 */
export async function getAccessibilityTree(page: Page): Promise<A11yNode[]> {
  const client = await page.context().newCDPSession(page);
  await client.send("Accessibility.enable");
  await client.send("DOM.enable");

  const { nodes } = (await client.send(
    "Accessibility.getFullAXTree",
  )) as unknown as { nodes: AXNodeRaw[] };

  const byId = new Map<string, AXNodeRaw>();
  for (const n of nodes) byId.set(n.nodeId, n);

  const domCache = new Map<number, { tag: string; attributes: Record<string, string> }>();
  async function domInfo(backendNodeId?: number) {
    if (backendNodeId == null) return undefined;
    const cached = domCache.get(backendNodeId);
    if (cached) return cached;
    try {
      const { node } = (await client.send("DOM.describeNode", {
        backendNodeId,
      })) as unknown as { node: DomNodeRaw };
      const attrs: Record<string, string> = {};
      const a = node.attributes ?? [];
      for (let i = 0; i + 1 < a.length; i += 2) {
        const k = a[i];
        const v = a[i + 1];
        if (k !== undefined && v !== undefined) attrs[k] = v;
      }
      const info = { tag: (node.nodeName ?? "").toLowerCase(), attributes: attrs };
      domCache.set(backendNodeId, info);
      return info;
    } catch {
      return undefined;
    }
  }

  async function build(id: string): Promise<A11yNode[]> {
    const node = byId.get(id);
    if (!node) return [];
    const childIds = node.childIds ?? [];

    // Ignored nodes aren't announced — lift their children up.
    if (node.ignored) {
      const lifted: A11yNode[] = [];
      for (const c of childIds) lifted.push(...(await build(c)));
      return lifted;
    }

    const info = await domInfo(node.backendDOMNodeId);
    const states: Record<string, unknown> = {};
    for (const p of node.properties ?? []) {
      if (p.value && "value" in p.value) states[p.name] = p.value.value;
    }
    const children: A11yNode[] = [];
    for (const c of childIds) children.push(...(await build(c)));

    return [
      {
        role: String(node.role?.value ?? ""),
        name: String(node.name?.value ?? ""),
        states: Object.keys(states).length ? states : undefined,
        tag: info?.tag,
        selector: info ? buildSelector(info.tag, info.attributes) : undefined,
        attributes: info?.attributes,
        children,
      },
    ];
  }

  const root = nodes.find((n) => !n.parentId);
  return root ? build(root.nodeId) : [];
}

/** Formats the tree as indented lines for human inspection. */
export function formatTree(nodes: A11yNode[], depth = 0): string {
  const out: string[] = [];
  for (const n of nodes) {
    const name = n.name ? ` "${n.name}"` : " (no accessible name)";
    const loc = n.selector ? `  [${n.selector}]` : "";
    out.push(`${"  ".repeat(depth)}- ${n.role || "?"}${name}${loc}`);
    if (n.children.length) out.push(formatTree(n.children, depth + 1));
  }
  return out.join("\n");
}
