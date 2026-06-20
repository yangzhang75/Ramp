/**
 * Entry point for running the control-plane locally.
 * Run with: pnpm --filter @ramp/control-plane serve
 *
 * Loads the repo-root .env (ANTHROPIC_API_KEY, RAMP_DB_PATH, ports) if present.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "../../../.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

await import("./instrument.js"); // init Sentry after env is loaded
const { startServer } = await import("./server.js");
startServer();
