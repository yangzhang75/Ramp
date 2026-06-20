/**
 * html-live leaderboard: naked vs harness on renderable pages only.
 *
 * Runs two suites of complete, gold-annotated pages:
 *   - data/fixtures-live  — render-dependent: contrast lives in EXTERNAL CSS, so a
 *                           model that only reads the HTML is blind to it. This is
 *                           where the harness's rendering + check_contrast earns its keep.
 *   - data/fixtures       — the existing inline-CSS pages (baseline; naked can read colors).
 *
 * naked   = one gpt-4o-mini call given ONLY the page's .html (no external CSS).
 * harness = @ramp/harness runAudit() — opens the page in Chromium (CSS loads), full tools.
 * Both graded with the same matcher the leaderboard uses; reports recall + precision,
 * per-suite and combined, and writes packages/scoring/data/html-live-leaderboard.json.
 * Network calls retry on transient failures. Does NOT touch leaderboard.json.
 *
 * Usage: OPENAI_API_KEY=... pnpm --filter @ramp/bench score:html-live
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "@ramp/harness";
import type { AnnotatedFinding, Finding, ViolationType } from "@ramp/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const OUT = join(__dirname, "..", "..", "scoring", "data", "html-live-leaderboard.json");
const MODEL = process.env.RAMP_AUDIT_MODEL ?? "gpt-4o-mini";
const MAX_STEPS = Number(process.env.HL_MAX_STEPS ?? 25);
const RUNS = Number(process.env.HL_RUNS ?? 1);

const SUITES = [
  { dir: "fixtures-live", label: "render-dependent (contrast in external CSS)" },
  { dir: "fixtures", label: "inline-CSS baseline" },
];

const VIOLATION_TYPES: ViolationType[] = [
  "missing_alt_text", "missing_form_labels", "icon_button_accessible_names",
  "low_color_contrast", "heading_structure", "missing_landmarks",
  "missing_focus_indicator", "keyboard_navigation",
];

// ---- grader: verbatim mirror of @ramp/scoring src/match.ts ----
function wcagNums(r: string) { return [...new Set((r.match(/\d+\.\d+(?:\.\d+)?/g) ?? []).map(m => m.replace(/[^\d.]/g, "")))]; }
function wcagMatch(e: string, a: string) { const E = wcagNums(e), A = wcagNums(a); return E.length && A.length ? E.some(n => A.includes(n)) : e.trim() === a.trim(); }
function normPath(p: string) { return p.replace(/^\.\//, "").replace(/\\/g, "/"); }
function pathsMatch(ef: string, sf?: string) { if (!sf?.trim()) return false; const a = normPath(ef), b = normPath(sf); return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`); }
function srcFile(f: Finding, files: string[], page?: string) {
  if (f.sourceFile?.trim()) return f.sourceFile.trim();
  const hay = [f.page, page].filter(Boolean).join("\n");
  if (hay) { const m = files.find(x => hay.includes(normPath(x))); if (m) return m; }
  const u = [...new Set(files.map(normPath))]; return u.length === 1 ? u[0] : undefined;
}
function match(exp: AnnotatedFinding, f: Finding) {
  return f.type === exp.type && wcagMatch(exp.wcagRule, f.wcagRule) && pathsMatch(exp.file, f.sourceFile);
}
function grade(expected: AnnotatedFinding[], detected: Finding[], page?: string) {
  const enriched = detected.map(f => { const sf = srcFile(f, expected.map(e => e.file), page); return sf && sf !== f.sourceFile ? { ...f, sourceFile: sf } : f; });
  let tp = 0; const used = new Set<string>();
  for (const e of expected) { const hit = enriched.find(f => !used.has(f.id) && match(e, f)); if (hit) { tp++; used.add(hit.id); } }
  return { tp, recall: expected.length ? tp / expected.length : 0, precision: detected.length ? tp / detected.length : 0 };
}

async function retry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T | null> {
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (e) { console.warn(`  [retry ${i}/${attempts}] ${label}: ${e instanceof Error ? e.message.slice(0, 120) : e}`); await new Promise(r => setTimeout(r, 2000 * i)); }
  }
  console.warn(`  [give up] ${label}`); return null;
}

const NAKED_SYSTEM = `You are a WCAG accessibility auditor. You only receive HTML/source context — no tools.
List every accessibility violation you can justify from the markup/source.
Use exact ViolationType values and set sourceFile to the repo-relative path provided in the context.`;

async function nakedAudit(file: string, html: string, runId: string): Promise<Finding[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const user = `File: ${file}\nHTML source:\n${html.slice(0, 60000)}\n\nAllowed ViolationType values: ${JSON.stringify(VIOLATION_TYPES)}\nReturn ONLY JSON {"findings":[{"type","wcagRule","sourceFile","severity","confidence","evidence"}]}. Set sourceFile to "${file}".`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: NAKED_SYSTEM }, { role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return [];
  let parsed: { findings?: Array<Record<string, unknown>> };
  try { parsed = JSON.parse(content); } catch { return []; }
  return (parsed.findings ?? [])
    .filter(f => VIOLATION_TYPES.includes(f.type as ViolationType))
    .map((f, i) => ({ id: `${runId}-f${i + 1}`, runId, type: f.type as ViolationType, severity: (f.severity as Finding["severity"]) ?? "serious", wcagRule: String(f.wcagRule ?? ""), sourceFile: typeof f.sourceFile === "string" ? f.sourceFile : file, confidence: typeof f.confidence === "number" ? f.confidence : 0.6, autoFixable: true, page: file }));
}

interface Row { expected: number; tp: number; detected: number }
function agg(rows: Row[]) {
  const e = rows.reduce((s, r) => s + r.expected, 0), tp = rows.reduce((s, r) => s + r.tp, 0), d = rows.reduce((s, r) => s + r.detected, 0);
  return { expected: e, truePositives: tp, detected: d, recall: e ? tp / e : 0, precision: d ? tp / d : 0 };
}
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

interface Page { id: string; file: string; expectedFindings: AnnotatedFinding[] }

export async function scoreHtmlLive(): Promise<void> {
  process.env.RAMP_AUDIT_PROVIDER = "openai";
  process.env.RAMP_AUDIT_MODEL = MODEL;

  const suiteResults: Record<string, { naked: Row[]; harness: Row[] }> = {};
  const allNaked: Row[] = [], allHarness: Row[] = [];

  for (let run = 1; run <= RUNS; run++) {
    console.log(`\n========== RUN ${run}/${RUNS} ==========`);
    for (const suite of SUITES) {
      const dir = join(DATA, suite.dir);
      const gtPath = join(dir, "ground-truth.json");
      if (!existsSync(gtPath)) { console.log(`(skip ${suite.dir}: no ground-truth.json)`); continue; }
      const pages = JSON.parse(readFileSync(gtPath, "utf8")) as Page[];
      const sr = (suiteResults[suite.dir] ??= { naked: [], harness: [] });
      console.log(`\n[${suite.dir}] ${suite.label} — ${pages.length} pages`);
      for (const p of pages) {
        const abs = resolve(dir, p.file);
        if (!existsSync(abs)) { console.log(`   skip ${p.file} (missing)`); continue; }
        const html = readFileSync(abs, "utf8");
        const naked = (await retry(`naked ${p.file}`, () => nakedAudit(p.file, html, `${p.id}-n${run}`))) ?? [];
        const ng = grade(p.expectedFindings, naked, abs);
        const harness = (await retry(`harness ${p.file}`, () => runAudit({ url: abs, runId: `${p.id}-h${run}`, maxSteps: MAX_STEPS }))) ?? [];
        const hg = grade(p.expectedFindings, harness, abs);
        const nRow = { expected: p.expectedFindings.length, tp: ng.tp, detected: naked.length };
        const hRow = { expected: p.expectedFindings.length, tp: hg.tp, detected: harness.length };
        sr.naked.push(nRow); sr.harness.push(hRow);
        allNaked.push(nRow); allHarness.push(hRow);
        console.log(`   ${p.file.padEnd(24)} naked ${ng.tp}/${p.expectedFindings.length} (${naked.length}rep) R ${pct(ng.recall)} P ${pct(ng.precision)} | harness ${hg.tp}/${p.expectedFindings.length} (${harness.length}rep) R ${pct(hg.recall)} P ${pct(hg.precision)}`);
      }
    }
  }

  const out = {
    benchmark: "html-live",
    note: "naked (HTML source only) vs harness (rendered page + axe + a11y tree + contrast). Renderable pages only — NOT the source-code bench tasks. Separate from leaderboard.json.",
    model: MODEL, runs: RUNS,
    suites: Object.fromEntries(Object.entries(suiteResults).map(([k, v]) => [k, {
      label: SUITES.find(s => s.dir === k)?.label, pages: v.naked.length / RUNS,
      naked: agg(v.naked), harness: agg(v.harness),
    }])),
    combined: { naked: agg(allNaked), harness: agg(allHarness) },
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

  console.log("\n" + "=".repeat(64));
  for (const [dir, v] of Object.entries(out.suites)) {
    console.log(`\n[${dir}] ${v.label}`);
    console.log(`  naked    recall ${pct(v.naked.recall)}  precision ${pct(v.naked.precision)}  (${v.naked.truePositives}/${v.naked.expected} hit, ${v.naked.detected} rep)`);
    console.log(`  harness  recall ${pct(v.harness.recall)}  precision ${pct(v.harness.precision)}  (${v.harness.truePositives}/${v.harness.expected} hit, ${v.harness.detected} rep)`);
  }
  console.log(`\n[COMBINED — all html-live pages]`);
  console.log(`  naked    recall ${pct(out.combined.naked.recall)}  precision ${pct(out.combined.naked.precision)}  (${out.combined.naked.truePositives}/${out.combined.naked.expected} hit, ${out.combined.naked.detected} rep)`);
  console.log(`  harness  recall ${pct(out.combined.harness.recall)}  precision ${pct(out.combined.harness.precision)}  (${out.combined.harness.truePositives}/${out.combined.harness.expected} hit, ${out.combined.harness.detected} rep)`);
  console.log(`\nwrote ${OUT}`);
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) scoreHtmlLive().catch(e => { console.error("[html-live] failed:", e); process.exit(1); });
