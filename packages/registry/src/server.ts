// Zero-dep HTTP server for the reputation registry.
//   POST /warrants                     submit a warrant (re-verified + sig-checked)
//   GET  /reputation                   full context-conditioned reputation
//   GET  /agents/:id/reputation[?domain=]  one agent's portable reputation
//   GET  /board.json                   all stored warrants (feeds a live board)
//   GET  /healthz
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse, Server } from "node:http";
import { fileURLToPath } from "node:url";
import type { Warrant } from "../../verify/src/index.js";
import { Registry } from "./store.js";
import type { RegistryOptions } from "./store.js";

function send(res: ServerResponse, code: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(text);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

/** Build the registry HTTP server. Pass options (trusted keys, seed) through. */
export function createRegistryServer(opts: RegistryOptions = {}): { server: Server; registry: Registry } {
  const registry = new Registry(opts);

  const server = createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    try {
      if (method === "POST" && path === "/warrants") {
        const raw = await readBody(req);
        let w: Warrant;
        try {
          w = JSON.parse(raw) as Warrant;
        } catch {
          return send(res, 400, { error: "invalid JSON" });
        }
        const result = registry.submit(w);
        return send(res, result.accepted ? 201 : 422, result);
      }

      if (method === "GET" && path === "/reputation") {
        return send(res, 200, registry.reputation());
      }

      if (method === "GET" && path === "/board.json") {
        return send(res, 200, registry.list());
      }

      if (method === "GET" && path === "/healthz") {
        return send(res, 200, { ok: true, warrants: registry.size() });
      }

      const m = path.match(/^\/agents\/(.+)\/reputation$/);
      if (method === "GET" && m) {
        const agentId = decodeURIComponent(m[1]);
        const domain = url.searchParams.get("domain") ?? undefined;
        return send(res, 200, registry.agentReputation(agentId, domain));
      }

      return send(res, 404, { error: "not found", path });
    } catch (e) {
      return send(res, 500, { error: (e as Error).message });
    }
  });

  return { server, registry };
}

// Run directly: `node dist/registry/src/server.js`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT ?? 8787);
  const { server } = createRegistryServer();
  server.listen(port, () => console.log(`warrant registry listening on :${port}`));
}
