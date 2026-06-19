/**
 * SQLite connection factory. All packages should obtain their DB handle via
 * {@link getDb} rather than constructing a driver directly, so the connection
 * (and pragmas) stay consistent across the monorepo.
 */
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema } from "./schema.js";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | null = null;
let cachedPath: string | null = null;

function findWorkspaceRoot(start = process.cwd()): string {
  let dir = start;
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

function resolveDbPath(dbPath: string): string {
  if (isAbsolute(dbPath)) return dbPath;
  return resolve(findWorkspaceRoot(), dbPath);
}

/**
 * Returns a memoized Drizzle SQLite handle.
 *
 * @param dbPath path to the SQLite file. Defaults to `RAMP_DB_PATH` env var,
 *   then `ramp.db` at the monorepo root (not the caller's cwd).
 */
export function getDb(dbPath = process.env.RAMP_DB_PATH ?? "ramp.db"): Db {
  const resolved = resolveDbPath(dbPath);
  if (cached && cachedPath === resolved) return cached;

  const sqlite = new Database(resolved);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  cached = drizzle(sqlite, { schema });
  cachedPath = resolved;
  return cached;
}
