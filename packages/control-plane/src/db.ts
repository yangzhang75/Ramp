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
import { findings, runs } from "@ramp/shared/db";

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

/** Fetches a run plus its findings, or null if the run doesn't exist. */
export function getRunWithFindings(db: Db, id: string) {
  const run = db.select().from(runs).where(eq(runs.id, id)).get();
  if (!run) return null;
  const runFindings = db
    .select()
    .from(findings)
    .where(eq(findings.runId, id))
    .all();
  return { run, findings: runFindings };
}
