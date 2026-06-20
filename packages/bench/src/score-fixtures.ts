/**
 * Fair-comparison harness benchmark on self-contained fixture pages.
 *
 * Unlike the repo-cloning leaderboard (score.ts), this runs naked vs harness on
 * complete, standalone .html pages in data/fixtures — each authored to contain a
 * known set of accessibility violations and nothing else. That removes the
 * confound of template fragments / source files the live-page harness cannot
 * open, so the comparison is apples-to-apples.
 *
 * For each page:
 *   - naked   : one gpt-4o-mini call that only sees the HTML (no tools).
 *   - harness : @ramp/harness runAudit() — Playwright + axe + a11y-tree tools.
 * Both are graded against data/fixtures/ground-truth.json with the SAME grader
 * the leaderboard uses (gradeDetection, mirrored below), and we report recall
 * AND precision. Precision is the headline: naked tends to over-report.
 *
 * Does NOT write leaderboard.json or the DB — it just prints metrics.
 *
 * Usage:
 *   OPENAI_API_KEY=... pnpm --filter @ramp/bench score:fixtures
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "@ramp/harness";
import type { AnnotatedFinding, Finding, ViolationType } from "@ramp/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "data", "fixtures");
const GROUND_TRUTH_PATH = join(FIXTURES_DIR, "ground-truth.json");

const MODEL = process.env.RAMP_AUDIT_MODEL ?? "gpt-4o-mini";
const MAX_STEPS = Number(process.env.FIXTURE_MAX_STEPS ?? 25);

const VIOLATION_TYPES: ViolationType[] = [
  "missing_alt_text",
  "missing_form_labels",
  "icon_button_accessible_names",
  "low_color_contrast",
  "heading_structure",
  "missing_landmarks",
  "missing_focus_indicator",
  "keyboard_navigation",
];

interface FixtureTask {
  id: string;
  file: string;
  auditMode: string;
  expectedFindings: AnnotatedFinding[];
}

// ---------------------------------------------------------------------------
// Grading — verbatim mirror of @ramp/scoring src/match.ts so the fixtures are
// scored exactly the way the leaderboard scores real tasks.
// ---------------------------------------------------------------------------

function extractWcagNumbers(rule: string): string[] {
  const matches = rule.match(/\d+\.\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/[^\d.]/g, "")))];
}
function normalizeWcagRule(rule: string): string {
  return rule.trim().split(/\s+/)[0]?.replace(/[^\d.]/g, "") ?? rule.trim();
}
function wcagRulesMatch(expected: string, actual: string): boolean {
  const e = extractWcagNumbers(expected);
  const a = extractWcagNumbers(actual);
  if (e.length > 0 && a.length > 0) return e.some((n) => a.includes(n));
  return normalizeWcagRule(expected) === normalizeWcagRule(actual);
}
function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replace(/\\/g, "/");
}
function pathsMatch(expectedFile: string, sourceFile?: string): boolean {
  if (!sourceFile?.trim()) return false;
  const a = normalizePath(expectedFile);
  const b = normalizePath(sourceFile);
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}
function resolveFindingSourceFile(
  finding: Finding,
  expectedFiles: string[],
  pageUrl?: string,
): string | undefined {
  if (finding.sourceFile?.trim()) return finding.sourceFile.trim();
  const haystack = [finding.page, pageUrl].filter(Boolean).join("\n");
  if (haystack) {
    const byPath = expectedFiles.find((file) =>
      haystack.includes(normalizePath(file)),
    );
    if (byPath) return byPath;
  }
  const unique = [...new Set(expectedFiles.map(normalizePath))];
  if (unique.length === 1) return unique[0];
  return undefined;
}
function enrichFindingForMatch(
  finding: Finding,
  expected: AnnotatedFinding[],
  pageUrl?: string,
): Finding {
  const sourceFile = resolveFindingSourceFile(
    finding,
    expected.map((row) => row.file),
    pageUrl,
  );
  if (!sourceFile || sourceFile === finding.sourceFile) return finding;
  return { ...finding, sourceFile };
}
function matchFinding(expected: AnnotatedFinding, finding: Finding): boolean {
  return (
    finding.type === expected.type &&
    wcagRulesMatch(expected.wcagRule, finding.wcagRule) &&
    pathsMatch(expected.file, finding.sourceFile)
  );
}
function gradeDetection(
  expected: AnnotatedFinding[],
  detected: Finding[],
  pageUrl?: string,
): { truePositives: number; recall: number; precision: number } {
  const enriched = detected.map((f) => enrichFindingForMatch(f, expected, pageUrl));
  let truePositives = 0;
  const matched = new Set<string>();
  for (const exp of expected) {
    const hit = enriched.find((f) => !matched.has(f.id) && matchFinding(exp, f));
    if (hit) {
      truePositives++;
      matched.add(hit.id);
    }
  }
  const recall = expected.length === 0 ? 0 : truePositives / expected.length;
  const precision = detected.length === 0 ? 0 : truePositives / detected.length;
  return { truePositives, recall, precision };
}

// ---------------------------------------------------------------------------
// Naked audit — model sees only the HTML, no tools (mirrors score.ts).
// ---------------------------------------------------------------------------

const NAKED_SYSTEM = `You are a WCAG accessibility auditor. You only receive HTML/source context — no tools.
List every accessibility violation you can justify from the markup/source.
Use exact ViolationType values and set sourceFile to the repo-relative path provided in the context.`;

async function runNakedAudit(
  task: FixtureTask,
  html: string,
  runId: string,
): Promise<Finding[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const user =
    `Task ${task.id}\n` +
    `Primary HTML (file ${task.file}):\n${html}\n\n` +
    `Allowed ViolationType values: ${JSON.stringify(VIOLATION_TYPES)}\n` +
    `Return ONLY JSON: {"findings":[{"type","wcagRule","sourceFile","line","severity","confidence","evidence"}]}. ` +
    `Set sourceFile to "${task.file}".`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: NAKED_SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return [];

  let parsed: { findings?: Array<Record<string, unknown>> };
  try {
    parsed = JSON.parse(content) as { findings?: Array<Record<string, unknown>> };
  } catch {
    return [];
  }
  const raw = Array.isArray(parsed.findings) ? parsed.findings : [];
  return raw
    .filter((f) => VIOLATION_TYPES.includes(f.type as ViolationType))
    .map((f, index) => ({
      id: `${runId}-f${index + 1}`,
      runId,
      type: f.type as ViolationType,
      severity: (f.severity as Finding["severity"]) ?? "serious",
      wcagRule: String(f.wcagRule ?? ""),
      sourceFile: typeof f.sourceFile === "string" ? f.sourceFile : task.file,
      line: typeof f.line === "number" ? f.line : undefined,
      confidence: typeof f.confidence === "number" ? f.confidence : 0.6,
      autoFixable: true,
      evidence: typeof f.evidence === "string" ? f.evidence : undefined,
      page: task.file,
    }));
}

interface Row {
  expected: number;
  truePositives: number;
  detected: number;
}

function aggregate(rows: Row[]): {
  expected: number;
  truePositives: number;
  detected: number;
  recall: number;
  precision: number;
} {
  const expected = rows.reduce((s, r) => s + r.expected, 0);
  const truePositives = rows.reduce((s, r) => s + r.truePositives, 0);
  const detected = rows.reduce((s, r) => s + r.detected, 0);
  return {
    expected,
    truePositives,
    detected,
    recall: expected === 0 ? 0 : truePositives / expected,
    precision: detected === 0 ? 0 : truePositives / detected,
  };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export async function scoreFixtures(): Promise<void> {
  process.env.RAMP_AUDIT_PROVIDER = "openai";
  process.env.RAMP_AUDIT_MODEL = MODEL;

  const tasks = JSON.parse(readFileSync(GROUND_TRUTH_PATH, "utf8")) as FixtureTask[];
  console.log(`[fixtures] ${tasks.length} pages, model ${MODEL}\n`);

  const nakedRows: Row[] = [];
  const harnessRows: Row[] = [];

  for (const task of tasks) {
    const filePath = resolve(FIXTURES_DIR, task.file);
    const html = readFileSync(filePath, "utf8");
    console.log(`[fixtures] ${task.id} (${task.file}) — ${task.expectedFindings.length} expected`);

    const naked = await runNakedAudit(task, html, `${task.id}-naked`);
    const nakedGrade = gradeDetection(task.expectedFindings, naked, filePath);
    nakedRows.push({
      expected: task.expectedFindings.length,
      truePositives: nakedGrade.truePositives,
      detected: naked.length,
    });
    console.log(
      `  naked   ${nakedGrade.truePositives}/${task.expectedFindings.length} hit, ${naked.length} reported — recall ${pct(nakedGrade.recall)} precision ${pct(nakedGrade.precision)}`,
    );

    const harness = await runAudit({
      url: filePath,
      runId: `${task.id}-harness`,
      maxSteps: MAX_STEPS,
    });
    const harnessGrade = gradeDetection(task.expectedFindings, harness, filePath);
    harnessRows.push({
      expected: task.expectedFindings.length,
      truePositives: harnessGrade.truePositives,
      detected: harness.length,
    });
    console.log(
      `  harness ${harnessGrade.truePositives}/${task.expectedFindings.length} hit, ${harness.length} reported — recall ${pct(harnessGrade.recall)} precision ${pct(harnessGrade.precision)}\n`,
    );
  }

  const naked = aggregate(nakedRows);
  const harness = aggregate(harnessRows);

  console.log("=".repeat(62));
  console.log(`[fixtures] TOTAL across ${tasks.length} pages, ${naked.expected} expected findings\n`);
  console.log(
    `  naked    recall ${pct(naked.recall)}  precision ${pct(naked.precision)}   (${naked.truePositives} hit / ${naked.detected} reported)`,
  );
  console.log(
    `  harness  recall ${pct(harness.recall)}  precision ${pct(harness.precision)}   (${harness.truePositives} hit / ${harness.detected} reported)`,
  );
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  scoreFixtures().catch((error) => {
    console.error("[fixtures] failed:", error);
    process.exit(1);
  });
}
