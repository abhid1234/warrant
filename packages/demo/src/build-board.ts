// Builds the public reputation board: a single self-contained HTML file
// (openable via file://) generated FROM the warrants — it dogfoods the format.
// Reputation is context-conditioned (per task domain): an agent ranks separately
// per skill, because good-at-refunds != good-at-booking. The ranking logic lives
// in @warrant/verify (tallyReputation) — the board only renders it.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { AgentRep, DomainRep, Reputation, Warrant, Consensus, VerifierStanding } from "../../verify/src/index.js";
import { tallyReputation, repFor, harnessOf, consensusVerdict, verifierStandings, outcomeKey } from "../../verify/src/index.js";
import { allWarrants, multiVerifierWarrants } from "./scenarios.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..", ".."); // dist/demo/src -> repo root
const siteDir = join(repoRoot, "site");
const dataDir = join(siteDir, "data");
// The browser-side live renderer (progressive enhancement; activates with ?registry=).
const boardLiveJs = readFileSync(join(repoRoot, "packages", "demo", "src", "board-live.js"), "utf8");
// Default hosted registry the board reads live from (same-origin serverless read API).
// Overridable per visit with ?registry=<url>; ignored on local file:// opens.
const DEFAULT_REGISTRY = "/api";

const esc = (s: unknown): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const pct = (s: number | null): string => (s === null ? "—" : `${Math.round(s * 100)}%`);
const cls = (s: number | null): string => (s === null ? "mid" : s >= 0.8 ? "hi" : s <= 0.34 ? "lo" : "mid");

const CHIP_OK = new Set(["warranted", "refuted", "unverifiable", "disputed"]);
const chip = (v: string): string => `<span class="chip ${CHIP_OK.has(v) ? v : "unverifiable"}">${esc(v)}</span>`;

function verifierSection(standings: VerifierStanding[]): string {
  const rows = standings
    .map((s) => {
      const c = s.score === null ? "mid" : s.score >= 0.8 ? "hi" : s.score <= 0.34 ? "lo" : "mid";
      return `<tr><td class="agent">${esc(s.name ?? s.issuerId)}</td>
        <td class="num"><span class="rate ${c}">${pct(s.score)}</span></td>
        <td class="num">${s.judged}</td><td class="num dim">${s.outvoted}</td></tr>`;
    })
    .join("\n");
  return `<table class="board"><thead><tr><th>verifier</th><th class="num">agreement</th><th class="num">peer-judged</th><th class="num dim">outvoted</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function consensusSection(rows: Array<{ label: string; domain: string; c: Consensus }>): string {
  const body = rows
    .map(
      (r) => `<tr><td>${esc(r.label)}</td><td class="dim">${esc(r.domain)}</td>
        <td class="num">${r.c.issuers}</td><td class="num">${r.c.warranted}</td><td class="num">${r.c.refuted}</td><td>${chip(r.c.value)}</td></tr>`,
    )
    .join("\n");
  return `<table class="board"><thead><tr><th>outcome</th><th>context</th><th class="num">verifiers</th><th class="num">✓</th><th class="num">✗</th><th>consensus</th></tr></thead><tbody>${body}</tbody></table>`;
}

function leaderboard(d: DomainRep): string {
  const rows = d.agents
    .map((a: AgentRep) => {
      const c = cls(a.score);
      return `<tr>
        <td class="agent">${esc(a.name)}</td>
        <td class="num"><span class="bar"><span class="${c}" style="width:${a.score === null ? 0 : Math.round(a.score * 100)}%"></span></span><span class="rate ${c}">${pct(a.score)}</span></td>
        <td class="num dim" title="Wilson lower bound — confidence-adjusted rate">${pct(a.confidence)}</td>
        <td class="num">${a.warranted}</td>
        <td class="num">${a.refuted}</td>
        <td class="num dim">${a.unverifiable}</td>
        <td class="num dim">${a.total}</td>
      </tr>`;
    })
    .join("\n");
  return `<section>
    <h3>${esc(d.domain)}</h3>
    <table class="board">
      <thead><tr><th>agent</th><th class="num">warranted&nbsp;rate</th><th class="num dim">conf</th><th class="num">✓</th><th class="num">✗</th><th class="num dim">?</th><th class="num dim">n</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function matrix(rep: Reputation): string {
  const domains = rep.domains.map((d) => d.domain);
  const head = `<tr><th></th>${domains.map((d) => `<th class="num">${esc(d)}</th>`).join("")}</tr>`;
  const body = rep.agentOrder
    .map(({ id, name }) => {
      const cells = domains
        .map((domain) => {
          const a = repFor(rep, domain, id);
          if (!a) return `<td class="num cell empty">—</td>`;
          return `<td class="num cell ${cls(a.score)}">${pct(a.score)}<span class="celln">${a.warranted}/${a.warranted + a.refuted}</span></td>`;
        })
        .join("");
      return `<tr><td class="agent">${esc(name)}</td>${cells}</tr>`;
    })
    .join("\n");
  return `<table class="board matrix"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function recent(warrants: Warrant[]): string {
  const rows = warrants
    .map((w) => {
      const ev = w.verification.evidence[0];
      const live = (w.task_context.tags ?? []).includes("live-demo");
      const h = harnessOf(w);
      return `<tr class="${live ? "live" : ""}">
        <td class="agent">${esc(w.subject.name)}${live ? ' <span class="tag">live</span>' : ""}</td>
        <td class="dim">${esc(w.task_context.domain)}</td>
        <td>${esc(w.claimed_outcome.summary ?? "")}</td>
        <td class="mono dim">${esc(ev.source)}${ev.independent ? "" : " (self)"}</td>
        <td class="mono dim">${h ? esc(h) : "—"}</td>
        <td>${chip(w.verdict.value)}</td>
      </tr>`;
    })
    .join("\n");
  return `<table class="board recent">
    <thead><tr><th>agent</th><th>context</th><th>claim</th><th>evidence&nbsp;source</th><th>harness</th><th>verdict</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function render(warrants: Warrant[], standings: VerifierStanding[], consensusRows: Array<{ label: string; domain: string; c: Consensus }>): string {
  const rep = tallyReputation(warrants);
  const boards = rep.domains.map(leaderboard).join("\n");
  const counts = rep.totals;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Warrant — Public Reputation Board</title>
<meta name="description" content="Agents ranked by what they actually did — world-state outcome-verification + portable reputation for inter-agent calls.">
<meta property="og:type" content="website">
<meta property="og:title" content="Warrant — verify what an AI agent actually did">
<meta property="og:description" content="World-state outcome-verification + portable reputation for inter-agent calls. No claim without a warrant.">
<meta property="og:image" content="https://warrant-gold.vercel.app/og.png">
<meta property="og:url" content="https://warrant-gold.vercel.app">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Warrant — verify what an AI agent actually did">
<meta name="twitter:description" content="World-state outcome-verification + portable reputation for inter-agent calls.">
<meta name="twitter:image" content="https://warrant-gold.vercel.app/og.png">
<style>
  :root { --bg:#0b0e14; --bg2:#11151d; --bg3:#171c26; --ink:#e7e9ef; --ink2:#aeb4c0; --dim:#6e7787; --rule:#222834;
    --hi:#3fb950; --lo:#f85149; --mid:#d29922; --accent:#3fb950;
    --mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,monospace; --sans:system-ui,-apple-system,"Segoe UI",Inter,sans-serif; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:var(--sans); line-height:1.55; -webkit-font-smoothing:antialiased;
    background-image:radial-gradient(70% 55% at 50% -8%, rgba(63,185,80,.07), transparent 72%); }
  .wrap { max-width:920px; margin:0 auto; padding:60px 28px 96px; }
  header { border-bottom:1px solid var(--rule); padding-bottom:20px; margin-bottom:30px; }
  .kicker { font-family:var(--mono); text-transform:uppercase; letter-spacing:.2em; font-size:11px; color:var(--dim); margin:0 0 10px; }
  h1 { font-size:44px; line-height:1.04; margin:0 0 10px; font-weight:700; letter-spacing:-.02em; }
  .sub { font-size:18px; color:var(--ink2); margin:6px 0 0; } .sub a { color:var(--accent); text-decoration:none; } .sub b { color:var(--ink); font-weight:600; }
  .abstract { font-size:15px; color:var(--ink2); margin:22px 0 6px; max-width:780px; }
  .abstract b { font-weight:600; color:var(--ink); }
  code { font-family:var(--mono); font-size:.92em; background:var(--bg2); border:1px solid var(--rule); border-radius:4px; padding:1px 5px; color:var(--ink); }
  .summary { display:flex; gap:12px; margin:30px 0 4px; }
  .summary div { flex:1; background:var(--bg2); border:1px solid var(--rule); border-radius:10px; padding:14px 16px; font-size:11px; color:var(--dim); font-family:var(--mono); text-transform:uppercase; letter-spacing:.07em; }
  .summary b { display:block; font-size:28px; color:var(--ink); font-weight:700; font-variant-numeric:tabular-nums; margin-bottom:3px; font-family:var(--sans); letter-spacing:-.01em; }
  .summary .w b { color:var(--hi); } .summary .r b { color:var(--lo); }
  h2 { font-family:var(--mono); font-size:12px; text-transform:uppercase; letter-spacing:.16em; color:var(--dim);
    margin:54px 0 16px; padding-bottom:8px; border-bottom:1px solid var(--rule); font-weight:500; }
  h3 { font-family:var(--mono); font-size:13px; color:var(--ink2); margin:24px 0 8px; font-weight:500; }
  table.board { width:100%; border-collapse:collapse; font-size:14px; margin-bottom:10px; background:var(--bg2); border:1px solid var(--rule); border-radius:10px; overflow:hidden; }
  table.board th { text-align:left; font-weight:500; font-size:10.5px; text-transform:uppercase; letter-spacing:.08em;
    color:var(--dim); border-bottom:1px solid var(--rule); padding:10px 12px; font-family:var(--mono); }
  table.board td { padding:10px 12px; border-bottom:1px solid var(--rule); vertical-align:middle; }
  table.board tbody tr:last-child td { border-bottom:none; }
  table.board tbody tr { transition:background .12s; } table.board tbody tr:hover td { background:var(--bg3); }
  td.agent { font-weight:600; color:var(--ink); }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; font-family:var(--mono); }
  .dim { color:var(--dim); }
  .mono { font-family:var(--mono); font-size:12px; }
  .bar { display:inline-block; width:80px; height:5px; background:var(--rule); border-radius:3px; margin-right:8px; vertical-align:middle; overflow:hidden; }
  .bar span { display:block; height:100%; background:var(--hi); }
  .bar span.hi { background:var(--hi); box-shadow:0 0 8px rgba(63,185,80,.6); } .bar span.mid { background:var(--mid); } .bar span.lo { background:var(--lo); }
  .rate { font-family:var(--mono); } .rate.hi { color:var(--hi); } .rate.mid { color:var(--mid); } .rate.lo { color:var(--lo); }
  .chip { font-family:var(--mono); font-size:11px; padding:2px 9px; border-radius:5px; white-space:nowrap; font-weight:500; }
  .chip.warranted { color:#c7f7d0; background:rgba(63,185,80,.15); box-shadow:inset 0 0 0 1px rgba(63,185,80,.45), 0 0 12px rgba(63,185,80,.16); }
  .chip.refuted { color:#ffd2ce; background:rgba(248,81,73,.15); box-shadow:inset 0 0 0 1px rgba(248,81,73,.45), 0 0 12px rgba(248,81,73,.16); }
  .chip.unverifiable { color:#cfd3dc; background:rgba(139,143,154,.16); box-shadow:inset 0 0 0 1px rgba(139,143,154,.4); }
  .chip.disputed { color:#ffe3a8; background:rgba(210,153,34,.15); box-shadow:inset 0 0 0 1px rgba(210,153,34,.5), 0 0 12px rgba(210,153,34,.14); }
  table.matrix td.cell { text-align:right; font-variant-numeric:tabular-nums; border-left:1px solid var(--rule); font-weight:600; font-family:var(--mono); }
  td.cell .celln { display:block; font-size:10px; color:var(--dim); font-weight:400; }
  td.cell.hi { color:var(--hi); background:rgba(63,185,80,.10); } td.cell.lo { color:var(--lo); background:rgba(248,81,73,.10); } td.cell.mid { color:var(--mid); background:rgba(210,153,34,.10); }
  td.cell.empty { color:#39414f; font-weight:400; }
  tr.live td { background:rgba(63,185,80,.05); }
  .tag { font-family:var(--mono); font-size:9.5px; text-transform:uppercase; letter-spacing:.1em;
    color:var(--mid); border:1px solid rgba(210,153,34,.4); border-radius:3px; padding:0 4px; vertical-align:middle; }
  .note { font-size:13.5px; color:var(--ink2); background:var(--bg2); border:1px solid var(--rule); border-left:2px solid var(--accent); padding:14px 18px; margin:16px 0; border-radius:0 8px 8px 0; }
  .note b { color:var(--ink); }
  footer { margin-top:64px; padding-top:18px; border-top:1px solid var(--rule); font-size:12px; color:var(--dim); }
  footer code { font-family:var(--mono); }
  .live-badge { font-family:var(--mono); font-size:10px; letter-spacing:.06em; color:var(--hi);
    border:1px solid rgba(63,185,80,.4); border-radius:4px; padding:2px 7px; margin-left:8px; box-shadow:0 0 10px rgba(63,185,80,.2); }
  .live-badge.off { color:var(--dim); border-color:var(--rule); box-shadow:none; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <p class="kicker">Warrant · outcome-verified · v0 <span id="w-live" class="live-badge" hidden></span></p>
    <h1>Public Reputation Board</h1>
    <p class="sub">An agent says the task is done. <b>Did it?</b> Ranked by what agents <b>actually did</b> — verified against the world, not their word. <a href="/playground.html" style="font-size:14px">Playground ↗</a></p>
  </header>

  <p class="abstract">Every entry here is a <b>warrant</b>: an independent check of the <b>world state</b> after an agent
  reported a task complete. A warrant is <b>warranted</b> only when a source the agent does not control
  (the airline's reservation system, the payments ledger, CI) confirms the claim. A self-reported
  <code>COMPLETED</code> earns nothing on its own. Reputation is <b>context-conditioned</b>: an agent is scored
  separately per skill, because being good at refunds says nothing about being good at booking flights.</p>

  <div class="summary" id="w-summary">
    <div class="w"><b>${counts.warranted}</b>warranted</div>
    <div class="r"><b>${counts.refuted}</b>refuted</div>
    <div><b>${counts.unverifiable}</b>unverifiable</div>
    <div><b>${counts.total}</b>total warrants</div>
  </div>

  <h2>Leaderboards by context</h2>
  <div id="w-boards">${boards}</div>

  <h2>Agent × context</h2>
  <p class="abstract" style="margin-top:0">Warranted-rate per skill. The same agent can sit at opposite ends across columns —
  that is the point.</p>
  <div id="w-matrix">${matrix(rep)}</div>

  <h2>Verifier standings · N-of-M</h2>
  <p class="abstract" style="margin-top:0">Verifiers are accountable too — a verifier outvoted by an independent peer consensus loses standing.</p>
  ${verifierSection(standings)}

  <h2>Consensus</h2>
  <p class="abstract" style="margin-top:0">Outcomes checked by several independent verifiers: agreement → a verdict; disagreement → <em>disputed</em>. Redundancy in place of crypto-economic stake.</p>
  ${consensusSection(consensusRows)}

  <h2>Recent warrants</h2>
  <div id="w-recent">${recent(warrants)}</div>

  <div class="note"><b>Why this is different.</b> Identity, transport, discovery and payment are solved elsewhere
  (A2A, MCP, ERC-8004, AP2). This board answers the one question they don't: <i>did the agent actually do it?</i>
  The verdict is derived from world-state evidence, never from the agent's self-reported log — the log is exactly
  what a silently-failing agent fabricates.</div>

  <footer>
    Generated from <code>${warrants.length}</code> warrants by <code>@warrant/verify</code> ·
    warrant format v0 (<code>docs/warrant-spec.md</code>). Illustrative demo data — agents, systems, and
    signatures are fictional. No claim without a warrant.
  </footer>
</div>
<script>window.__WARRANT_REGISTRY__=${JSON.stringify(DEFAULT_REGISTRY)};</script>
<script>${boardLiveJs}</script>
</body>
</html>
`;
}

(async () => {
  const warrants = await allWarrants();
  // Multi-verifier data powers the consensus + verifier-standings sections.
  const mv = await multiVerifierWarrants();
  const standings = verifierStandings(mv, { n: 2 });
  const groups = new Map<string, Warrant[]>();
  for (const w of mv) {
    const k = outcomeKey(w);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(w);
  }
  const consensusRows = [...groups.values()].map((grp) => ({
    label: grp[0].claimed_outcome.summary ?? grp[0].warrant_id,
    domain: grp[0].task_context.domain,
    c: consensusVerdict(grp, { n: 2 }),
  }));
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(siteDir, "index.html"), render(warrants, standings, consensusRows));
  writeFileSync(join(dataDir, "warrants.json"), JSON.stringify(warrants, null, 2));
  console.log(`board written: site/index.html  (${warrants.length} warrants)`);
  console.log(`data written:  site/data/warrants.json`);
})();
