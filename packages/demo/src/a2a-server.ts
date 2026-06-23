// Minimal A2A-shaped HTTP servers for the live end-to-end demo. This is NOT a new
// transport — it mirrors A2A's surface (an Agent Card that declares the Warrant
// extension; a task endpoint that returns a self-reported COMPLETED status) over
// plain HTTP, so the warrant flow can be exercised for real. Zero-dep.
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse, Server } from "node:http";
import type { AgentCard } from "./agents.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let d = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d));
  });
}
function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
export function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
}
export function close(server: Server): Promise<void> {
  return new Promise((r) => server.close(() => r()));
}

/** Ground-truth airline reservation system — the thing the verifier probes. */
export function createAirlineServer(): Server {
  const store = new Map<string, unknown>();
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";
    if (method === "POST" && url.pathname === "/book") {
      const b = JSON.parse(await readBody(req)) as { pnr: string };
      store.set(b.pnr, b);
      return json(res, 201, { ok: true, pnr: b.pnr });
    }
    const m = url.pathname.match(/^\/pnr\/(.+)$/);
    if (method === "GET" && m) {
      const r = store.get(decodeURIComponent(m[1]));
      if (!r) return json(res, 404, { error: "NOT_FOUND" });
      return json(res, 200, r);
    }
    return json(res, 404, { error: "not found" });
  });
}

export interface TaskResult {
  status: string; // self-reported A2A task state
  claimed: { pnr: string; summary: string };
  body: Record<string, unknown>; // OpenTrajectory body (the trace)
}

/** A2A agent: GET /agent-card declares the extension; POST /tasks runs the skill. */
export function createAgentServer(card: AgentCard, handle: (params: Record<string, unknown>) => Promise<TaskResult>): Server {
  let n = 0;
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";
    if (method === "GET" && (url.pathname === "/agent-card" || url.pathname === "/.well-known/agent-card.json")) {
      return json(res, 200, card);
    }
    if (method === "POST" && url.pathname === "/tasks") {
      const b = JSON.parse(await readBody(req)) as { params?: Record<string, unknown> };
      const result = await handle(b.params ?? {});
      return json(res, 200, { task: { id: `t_${++n}`, state: result.status }, claimed: result.claimed, body: result.body });
    }
    return json(res, 404, { error: "not found" });
  });
}
