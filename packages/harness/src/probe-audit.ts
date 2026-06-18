/**
 * Probe script: run the full audit agent against fixtures/bad.html and print
 * the returned Finding[].
 * Run with: pnpm --filter @ramp/harness probe:audit
 *
 * Requires ANTHROPIC_API_KEY (loaded from the repo-root .env if present).
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Load repo-root .env before importing audit (so the provider sees the key).
const envPath = resolve(here, "../../../.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const { runAudit } = await import("./audit.js");

const fixture = resolve(here, "../fixtures/bad.html");
console.log(`Running audit agent on ${fixture} ...\n`);

const findings = await runAudit({ url: fixture, runId: "bad-html-demo" });

console.log(`\nrunAudit returned ${findings.length} finding(s):\n`);
console.log(JSON.stringify(findings, null, 2));
