// Hosted registry — READ API (Vercel serverless, stateless). Serves the bundled
// warrant snapshot so the public board can run in live mode (?registry=/api).
// It is deliberately read-only: accepting + persisting warrants needs durable
// storage (Vercel KV / Postgres) or a stateful host — run packages/registry for
// that. Self-contained (no cross-package imports) so it builds cleanly on Vercel.
import warrants from "../site/data/warrants.json";

type W = {
  task_context: { domain: string };
  subject: { id: string; name?: string };
  verdict: { value: string };
};

function tally(ws: W[]) {
  const byDomain: Record<string, Record<string, { agentId: string; name: string; warranted: number; refuted: number; unverifiable: number; total: number; score: number | null }>> = {};
  const totals = { warranted: 0, refuted: 0, unverifiable: 0, total: 0 };
  for (const w of ws) {
    const d = w.task_context.domain, id = w.subject.id, name = w.subject.name ?? id;
    (byDomain[d] ??= {})[id] ??= { agentId: id, name, warranted: 0, refuted: 0, unverifiable: 0, total: 0, score: null };
    const r = byDomain[d][id];
    r.total++; totals.total++;
    const v = w.verdict.value;
    if (v === "warranted") { r.warranted++; totals.warranted++; }
    else if (v === "refuted") { r.refuted++; totals.refuted++; }
    else { r.unverifiable++; totals.unverifiable++; }
  }
  const domains = Object.keys(byDomain).sort().map((d) => {
    const agents = Object.values(byDomain[d]).map((a) => ({ ...a, score: a.warranted + a.refuted === 0 ? null : a.warranted / (a.warranted + a.refuted) }));
    agents.sort((x, y) => (y.score ?? -1) - (x.score ?? -1) || y.warranted - x.warranted);
    return { domain: d, agents };
  });
  return { domains, totals };
}

export default function handler(req: any, res: any) {
  res.setHeader("access-control-allow-origin", "*");
  const ws = warrants as unknown as W[];
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname.replace(/^\/api/, "") || "/";

  if (req.method === "GET" && path === "/board.json") return res.status(200).json(ws);
  if (req.method === "GET" && path === "/reputation") return res.status(200).json(tally(ws));
  if (req.method === "GET" && path === "/healthz") return res.status(200).json({ ok: true, warrants: ws.length, mode: "read-only" });
  if (req.method === "POST" && path === "/warrants")
    return res.status(501).json({ error: "this hosted endpoint is read-only; run @warrant/registry with durable storage (KV/Postgres) to accept + persist warrants" });
  return res.status(404).json({ error: "not found", path });
}
