/**
 * Control-plane HTTP server.
 *
 * Routes:
 *   POST /audit      { url?, repo?, hints?, framework? } → runs the audit agent,
 *                    persists a run + its findings, returns them.
 *   GET  /runs/:id           → returns the run record and its findings (for the dashboard).
 *   GET  /benchmark/scores   → latest naked vs harness detection metrics.
 *   GET  /benchmark/live-run → latest harness benchmark run + findings.
 *   GET  /benchmark/pr-card  → PR card payload from a curated bench task.
 *   GET  /health             → liveness probe.
 *
 * Uses node:http (no framework) to keep deps minimal.
 */
import { randomUUID } from "node:crypto";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { runAudit } from "@ramp/harness";
import { computeScore } from "@ramp/scoring";
import { getDb } from "@ramp/shared";
import {
  getBenchmarkLeaderboard,
  getBenchmarkPrCard,
  getBenchmarkScores,
  getLatestHarnessBenchmarkRun,
} from "./benchmark.js";
import {
  ensureSchema,
  getRunWithFindings,
  insertFindings,
  insertRun,
  insertScore,
  setRunStatus,
} from "./db.js";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

async function handleAudit(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  const url = typeof body.url === "string" ? body.url : undefined;
  const repo = typeof body.repo === "string" ? body.repo : undefined;
  const hints = typeof body.hints === "string" ? body.hints : undefined;
  const framework =
    typeof body.framework === "string" ? body.framework : undefined;

  if (!url && !repo) {
    sendJson(res, 400, { error: "provide `url` or `repo` in the JSON body" });
    return;
  }

  const db = getDb();
  const runId = randomUUID();
  insertRun(db, {
    id: runId,
    repoUrl: repo ?? url ?? "",
    targetUrl: url,
    framework,
    status: "auditing",
  });

  try {
    const findings = await runAudit({ url, repo, hints, runId });
    insertFindings(db, findings);

    // "before" compliance score from the findings just produced.
    const breakdown = computeScore(findings);
    insertScore(db, { runId, phase: "before", ...breakdown });

    setRunStatus(db, runId, "completed");
    sendJson(res, 200, {
      runId,
      status: "completed",
      findingsCount: findings.length,
      score: { phase: "before", ...breakdown },
      findings,
    });
  } catch (e) {
    setRunStatus(db, runId, "failed");
    sendJson(res, 500, {
      runId,
      status: "failed",
      error: (e as Error).message,
    });
  }
}

function handleGetRun(res: ServerResponse, id: string): void {
  const data = getRunWithFindings(getDb(), id);
  if (!data) {
    sendJson(res, 404, { error: `run not found: ${id}` });
    return;
  }
  sendJson(res, 200, data);
}

export function createServer(): Server {
  return createHttpServer((req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (method === "GET" && path === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (method === "POST" && path === "/audit") {
      handleAudit(req, res).catch((e) =>
        sendJson(res, 500, { error: (e as Error).message }),
      );
      return;
    }
    if (method === "GET" && path.startsWith("/runs/")) {
      handleGetRun(res, decodeURIComponent(path.slice("/runs/".length)));
      return;
    }
    if (method === "GET" && path === "/benchmark/scores") {
      sendJson(res, 200, getBenchmarkScores(getDb()));
      return;
    }
    if (method === "GET" && path === "/benchmark/live-run") {
      const data = getLatestHarnessBenchmarkRun(getDb());
      if (!data) {
        sendJson(res, 404, { error: "no benchmark harness run found yet" });
        return;
      }
      sendJson(res, 200, data);
      return;
    }
    if (method === "GET" && path === "/benchmark/pr-card") {
      const taskId = url.searchParams.get("taskId") ?? undefined;
      const data = getBenchmarkPrCard(getDb(), taskId ?? "ramp-003");
      if (!data) {
        sendJson(res, 404, { error: "no benchmark PR card available" });
        return;
      }
      sendJson(res, 200, data);
      return;
    }
    if (method === "GET" && path === "/benchmark/leaderboard") {
      sendJson(res, 200, { rows: getBenchmarkLeaderboard(getDb()) });
      return;
    }
    sendJson(res, 404, { error: `no route for ${method} ${path}` });
  });
}

/** Bootstraps the schema and starts listening. Returns the server. */
export function startServer(port = Number(process.env.CONTROL_PLANE_PORT ?? 8787)): Server {
  ensureSchema(getDb());
  const server = createServer();
  server.listen(port, () => {
    console.log(`control-plane listening on http://localhost:${port}`);
  });
  return server;
}
