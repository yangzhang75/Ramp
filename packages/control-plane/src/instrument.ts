/**
 * Sentry initialization — import this FIRST (before any other module) in every
 * Fix Loop entry point, per Sentry's official guidance.
 *
 * DSN comes from process.env.SENTRY_DSN (never hardcoded). If unset, Sentry is
 * a no-op so the loop still runs without monitoring.
 */
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.RAMP_ENV ?? "demo",
    tracesSampleRate: 1.0,
    debug: process.env.SENTRY_DEBUG === "1",
  });
} else if (process.env.SENTRY_DEBUG === "1") {
  console.warn("[sentry] SENTRY_DSN not set — monitoring disabled");
}
