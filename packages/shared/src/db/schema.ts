/**
 * Drizzle ORM schema for Ramp's SQLite database.
 *
 * Tables: runs, bench_tasks, findings, fixes, scores.
 * JSON-typed columns store structured payloads (e.g. annotated findings).
 */
import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AnnotatedFinding } from "../types.js";

/** End-to-end audit→fix→PR runs. */
export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  repoUrl: text("repo_url").notNull(),
  branch: text("branch"),
  targetUrl: text("target_url"),
  framework: text("framework"),
  packageManager: text("package_manager"),
  status: text("status").notNull().default("pending"),
  /** Set when this run is grading against a benchmark task. */
  benchTaskId: text("bench_task_id"),
  pullRequestUrl: text("pull_request_url"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at"),
});

/** Hand-annotated benchmark tasks (A11y-Bench). */
export const benchTasks = sqliteTable("bench_tasks", {
  id: text("id").primaryKey(),
  repoUrl: text("repo_url").notNull(),
  branch: text("branch"),
  framework: text("framework"),
  /** JSON array of ground-truth AnnotatedFinding records. */
  expectedFindings: text("expected_findings", { mode: "json" })
    .$type<AnnotatedFinding[]>()
    .notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

/** Violations surfaced during an audit. */
export const findings = sqliteTable("findings", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  wcagRule: text("wcag_rule").notNull(),
  domNode: text("dom_node"),
  page: text("page"),
  sourceFile: text("source_file"),
  line: integer("line"),
  confidence: real("confidence").notNull(),
  autoFixable: integer("auto_fixable", { mode: "boolean" }).notNull(),
  evidence: text("evidence"),
});

/** Repair attempts for findings. */
export const fixes = sqliteTable("fixes", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  findingId: text("finding_id").notNull(),
  status: text("status").notNull(),
  file: text("file").notNull(),
  diff: text("diff"),
  strategy: text("strategy").notNull(),
  validated: integer("validated", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
});

/** Compliance score snapshots (before / after). */
export const scores = sqliteTable("scores", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  phase: text("phase").notNull(),
  score: real("score").notNull(),
  critical: integer("critical").notNull().default(0),
  serious: integer("serious").notNull().default(0),
  moderate: integer("moderate").notNull().default(0),
  minor: integer("minor").notNull().default(0),
  totalViolations: integer("total_violations").notNull().default(0),
  computedAt: text("computed_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

/** Convenience grouping of every table for `drizzle(sqlite, { schema })`. */
export const schema = { runs, benchTasks, findings, fixes, scores };
