/**
 * SQLite connection factory. All packages should obtain their DB handle via
 * {@link getDb} rather than constructing a driver directly, so the connection
 * (and pragmas) stay consistent across the monorepo.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { schema } from "./schema.js";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | null = null;
let cachedPath: string | null = null;

/**
 * Returns a memoized Drizzle SQLite handle.
 *
 * @param dbPath path to the SQLite file. Defaults to `RAMP_DB_PATH` env var,
 *   then `ramp.db` in the current working directory.
 */
export function getDb(dbPath = process.env.RAMP_DB_PATH ?? "ramp.db"): Db {
  if (cached && cachedPath === dbPath) return cached;

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  cached = drizzle(sqlite, { schema });
  cachedPath = dbPath;
  return cached;
}
