/**
 * Curate html-live benchmark tasks from hand-authored annotations.
 *
 * Unlike curate.ts (which asks an LLM to read each diff), this path takes
 * ground-truth annotations written by a human in data/html-annotations.json and
 * turns them into BenchTask fixtures. It is used for the "html-live" subset:
 * PRs whose accessibility fix lands in a standalone .html page that the
 * live-page (Playwright) harness can open and audit.
 *
 * It performs no network or LLM calls — provenance (base/fix commit, title)
 * comes from the matching row already mined into data/candidates.jsonl.
 *
 * Every task is tagged `auditMode: "html-live"`, and the curator refuses any
 * finding whose `file` is not a .html/.htm page so the tag can never drift from
 * what `inferAuditMode` would otherwise derive.
 *
 * Usage:
 *   pnpm --filter @ramp/bench curate:html
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnnotatedFinding, AuditMode, BenchTask, ViolationType } from "@ramp/shared";
import type { CandidateRow } from "./mine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const CANDIDATES_PATH = join(DATA_DIR, "candidates.jsonl");
const ANNOTATIONS_PATH = join(DATA_DIR, "html-annotations.json");
const TASKS_DIR = join(DATA_DIR, "tasks");

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

const HTML_FILE = /\.(html?|htm)$/i;

interface AnnotationFinding {
  type?: string;
  wcagRule?: string;
  file?: string;
  line?: number;
  expectedFix?: string;
}

interface AnnotationEntry {
  repo: string;
  pr_number: number;
  framework?: string;
  branch?: string;
  findings: AnnotationFinding[];
}

/** Mirrors BenchTaskRecord in curate.ts so both writers produce the same shape. */
interface HtmlBenchTaskRecord extends BenchTask {
  auditMode: AuditMode;
  baseCommit: string;
  fixCommit: string;
  sourcePr: { repo: string; pr_number: number; title: string };
}

function loadCandidates(): Map<string, CandidateRow> {
  if (!existsSync(CANDIDATES_PATH)) {
    throw new Error(
      `Missing ${CANDIDATES_PATH}. Run pnpm --filter @ramp/bench mine first.`,
    );
  }
  const map = new Map<string, CandidateRow>();
  for (const line of readFileSync(CANDIDATES_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as CandidateRow;
    map.set(`${row.repo}#${row.pr_number}`, row);
  }
  return map;
}

function loadAnnotations(): AnnotationEntry[] {
  if (!existsSync(ANNOTATIONS_PATH)) {
    throw new Error(`Missing ${ANNOTATIONS_PATH}.`);
  }
  return JSON.parse(readFileSync(ANNOTATIONS_PATH, "utf8")) as AnnotationEntry[];
}

/** Returns the set of source PRs already curated, to skip duplicates. */
function existingSourcePrs(): Set<string> {
  mkdirSync(TASKS_DIR, { recursive: true });
  const keys = new Set<string>();
  for (const name of readdirSync(TASKS_DIR)) {
    if (!name.endsWith(".json")) continue;
    const task = JSON.parse(readFileSync(join(TASKS_DIR, name), "utf8")) as {
      sourcePr?: { repo: string; pr_number: number };
    };
    if (task.sourcePr) keys.add(`${task.sourcePr.repo}#${task.sourcePr.pr_number}`);
  }
  return keys;
}

function nextTaskId(taken: Set<number>): string {
  let next = 1;
  while (taken.has(next)) next++;
  taken.add(next);
  return `ramp-${String(next).padStart(3, "0")}`;
}

function usedTaskNumbers(): Set<number> {
  mkdirSync(TASKS_DIR, { recursive: true });
  const taken = new Set<number>();
  for (const name of readdirSync(TASKS_DIR)) {
    const match = /^ramp-(\d+)\.json$/.exec(name);
    if (match) taken.add(Number(match[1]));
  }
  return taken;
}

function validateFinding(raw: AnnotationFinding): AnnotatedFinding {
  if (!raw.type || !VIOLATION_TYPES.includes(raw.type as ViolationType)) {
    throw new Error(`invalid type: ${raw.type}`);
  }
  if (!raw.wcagRule) throw new Error("missing wcagRule");
  if (!raw.file) throw new Error("missing file");
  if (!HTML_FILE.test(raw.file)) {
    throw new Error(`file is not a .html page (breaks html-live): ${raw.file}`);
  }
  return {
    type: raw.type as ViolationType,
    wcagRule: raw.wcagRule,
    file: raw.file.replace(/^\.\//, ""),
    ...(typeof raw.line === "number" ? { line: raw.line } : {}),
    ...(raw.expectedFix ? { expectedFix: raw.expectedFix } : {}),
  };
}

export function curateHtmlTasks(): {
  written: number;
  skipped: number;
  tasks: HtmlBenchTaskRecord[];
} {
  const candidates = loadCandidates();
  const annotations = loadAnnotations();
  const already = existingSourcePrs();
  const taken = usedTaskNumbers();
  const now = new Date().toISOString();

  const tasks: HtmlBenchTaskRecord[] = [];
  let skipped = 0;

  for (const entry of annotations) {
    const key = `${entry.repo}#${entry.pr_number}`;
    const candidate = candidates.get(key);
    if (!candidate) {
      skipped++;
      console.warn(`[curate:html] skip ${key}: not in candidates.jsonl`);
      continue;
    }
    if (already.has(key)) {
      skipped++;
      console.warn(`[curate:html] skip ${key}: already curated`);
      continue;
    }

    let findings: AnnotatedFinding[];
    try {
      findings = entry.findings.map(validateFinding);
    } catch (error) {
      skipped++;
      console.warn(
        `[curate:html] skip ${key}: ${error instanceof Error ? error.message : error}`,
      );
      continue;
    }
    if (findings.length === 0) {
      skipped++;
      continue;
    }

    const id = nextTaskId(taken);
    const record: HtmlBenchTaskRecord = {
      id,
      repoUrl: `https://github.com/${entry.repo}`,
      ...(entry.branch ? { branch: entry.branch } : {}),
      framework: entry.framework ?? "unknown",
      auditMode: "html-live",
      expectedFindings: findings,
      createdAt: now,
      baseCommit: candidate.base_commit,
      fixCommit: candidate.fix_commit,
      sourcePr: {
        repo: candidate.repo,
        pr_number: candidate.pr_number,
        title: candidate.title,
      },
    };

    writeFileSync(
      join(TASKS_DIR, `${id}.json`),
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8",
    );
    tasks.push(record);
    already.add(key);
    console.log(
      `[curate:html] + ${id} ${key} (${findings.map((f) => f.type).join(", ")})`,
    );
  }

  return { written: tasks.length, skipped, tasks };
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  try {
    const { written, skipped } = curateHtmlTasks();
    console.log("\n[curate:html] done");
    console.log(`  tasks written : ${written}`);
    console.log(`  skipped       : ${skipped}`);
    console.log(`  output dir    : ${TASKS_DIR}`);
  } catch (error) {
    console.error("[curate:html] failed:", error);
    process.exit(1);
  }
}
