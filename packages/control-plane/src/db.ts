/**
 * DB access for the control plane: schema bootstrap + run/findings persistence.
 *
 * The schema mirrors packages/shared/src/db/schema.ts. We create the tables
 * idempotently at startup (CREATE TABLE IF NOT EXISTS) so a fresh ramp.db works
 * without a separate migration step; drizzle-kit migrations can replace this
 * later.
 */
import { eq } from "drizzle-orm";
import type { Db, Finding } from "@ramp/shared";
import { findings, runs, scores } from "@ramp/shared/db";

/** Creates the tables this service uses if they don't already exist. */
export function ensureSchema(db: Db): void {
  db.$client.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      repo_url TEXT NOT NULL,
      branch TEXT,
      target_url TEXT,
      framework TEXT,
      package_manager TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      bench_task_id TEXT,
      pull_request_url TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      wcag_rule TEXT NOT NULL,
      dom_node TEXT,
      page TEXT,
      source_file TEXT,
      line INTEGER,
      confidence REAL NOT NULL,
      auto_fixable INTEGER NOT NULL,
      evidence TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_findings_run_id ON findings (run_id);
    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      score REAL NOT NULL,
      critical INTEGER NOT NULL DEFAULT 0,
      serious INTEGER NOT NULL DEFAULT 0,
      moderate INTEGER NOT NULL DEFAULT 0,
      minor INTEGER NOT NULL DEFAULT 0,
      total_violations INTEGER NOT NULL DEFAULT 0,
      computed_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE INDEX IF NOT EXISTS idx_scores_run_id ON scores (run_id);
  `);
}

export interface NewRun {
  id: string;
  repoUrl: string;
  targetUrl?: string;
  framework?: string;
  status?: string;
}

export function insertRun(db: Db, r: NewRun): void {
  db.insert(runs)
    .values({
      id: r.id,
      repoUrl: r.repoUrl,
      targetUrl: r.targetUrl,
      framework: r.framework,
      status: r.status ?? "pending",
    })
    .run();
}

export function setRunStatus(db: Db, id: string, status: string): void {
  db.update(runs)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(runs.id, id))
    .run();
}

export function insertFindings(db: Db, items: Finding[]): void {
  if (items.length === 0) return;
  db.insert(findings)
    .values(
      items.map((f) => ({
        id: f.id,
        runId: f.runId,
        type: f.type,
        severity: f.severity,
        wcagRule: f.wcagRule,
        domNode: f.domNode,
        page: f.page,
        sourceFile: f.sourceFile,
        line: f.line,
        confidence: f.confidence,
        autoFixable: f.autoFixable,
        evidence: f.evidence,
      })),
    )
    .run();
}

export interface NewScore {
  runId: string;
  phase: "before" | "after";
  score: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  totalViolations: number;
}

export function insertScore(db: Db, s: NewScore): void {
  db.insert(scores)
    .values({
      id: `${s.runId}-${s.phase}`,
      runId: s.runId,
      phase: s.phase,
      score: s.score,
      critical: s.critical,
      serious: s.serious,
      moderate: s.moderate,
      minor: s.minor,
      totalViolations: s.totalViolations,
    })
    .run();
}

/** Fetches a run plus its findings and scores, or null if the run doesn't exist. */
export function getRunWithFindings(db: Db, id: string) {
  const run = db.select().from(runs).where(eq(runs.id, id)).get();
  if (!run) return null;
  const runFindings = db
    .select()
    .from(findings)
    .where(eq(findings.runId, id))
    .all();
  const runScores = db.select().from(scores).where(eq(scores.runId, id)).all();
  return { run, score: runScores.find((s) => s.phase === "before"), findings: runFindings, scores: runScores };
}
