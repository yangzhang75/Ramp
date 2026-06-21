/**
 * @ramp/shared — common foundation for every Ramp package:
 * domain types, the Drizzle SQLite schema + getDb(), and the stable
 * runAudit / runFixLoop signatures.
 */
export * from "./types.js";
export * from "./audit-mode.js";
export * from "./audit.js";
export * from "./fix.js";
export * as db from "./db/index.js";
export { getDb } from "./db/client.js";
export type { Db } from "./db/client.js";
