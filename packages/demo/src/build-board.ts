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
  :root { --ink:#1a1814; --paper:#f7f5ef; --rule:#d9d4c7; --dim:#7a7468; --hi:#1b5e20; --lo:#7f1d1d; --mid:#8a6d1b; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink);
    font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif;
    line-height:1.55; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:880px; margin:0 auto; padding:64px 28px 96px; }
  header { border-bottom:2px solid var(--ink); padding-bottom:18px; margin-bottom:28px; }
  .kicker { text-transform:uppercase; letter-spacing:.18em; font-size:11px; color:var(--dim); margin:0 0 8px; }
  h1 { font-size:42px; line-height:1.05; margin:0 0 8px; font-weight:600; letter-spacing:-.01em; }
  .sub { font-size:18px; color:#3a352c; margin:6px 0 0; font-style:italic; }
  .abstract { font-size:15.5px; color:#2c281f; margin:22px 0 6px; }
  .abstract b { font-weight:600; }
  .summary { display:flex; gap:26px; margin:26px 0 4px; padding:14px 0; border-top:1px solid var(--rule); border-bottom:1px solid var(--rule); }
  .summary div { font-size:13px; color:var(--dim); }
  .summary b { display:block; font-size:26px; color:var(--ink); font-weight:600; font-feature-settings:"tnum"; }
  .summary .w b { color:var(--hi); } .summary .r b { color:var(--lo); }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.16em; color:var(--dim);
    margin:52px 0 14px; padding-bottom:6px; border-bottom:1px solid var(--rule); font-weight:600; }
  h3 { font-family:ui-monospace,"SF Mono",Menlo,monospace; font-size:13px; color:#4a443a;
    margin:24px 0 8px; font-weight:600; }
  table.board { width:100%; border-collapse:collapse; font-size:14px; margin-bottom:8px; }
  table.board th { text-align:left; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.08em;
    color:var(--dim); border-bottom:1px solid var(--ink); padding:7px 10px; }
  table.board td { padding:8px 10px; border-bottom:1px solid var(--rule); vertical-align:middle; }
  td.agent { font-weight:600; }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; font-feature-settings:"tnum"; white-space:nowrap; }
  .dim { color:var(--dim); }
  .mono { font-family:ui-monospace,"SF Mono",Menlo,monospace; font-size:12px; }
  .bar { display:inline-block; width:84px; height:6px; background:#e4dfd2; border-radius:3px; margin-right:8px; vertical-align:middle; overflow:hidden; }
  .bar span { display:block; height:100%; background:var(--hi); }
  .bar span.hi { background:var(--hi); } .bar span.mid { background:var(--mid); } .bar span.lo { background:var(--lo); }
  .rate.hi { color:var(--hi); } .rate.mid { color:var(--mid); } .rate.lo { color:var(--lo); }
  .chip { font-family:ui-monospace,"SF Mono",Menlo,monospace; font-size:11px; padding:2px 8px; border-radius:3px; white-space:nowrap; }
  .chip.warranted { color:#fff; background:var(--hi); }
  .chip.refuted { color:#fff; background:var(--lo); }
  .chip.unverifiable { color:#fff; background:#8a8275; }
  .chip.disputed { color:#fff; background:var(--mid); }
  table.matrix td.cell { text-align:right; font-variant-numeric:tabular-nums; border-left:2px solid var(--paper); font-weight:600; }
  td.cell .celln { display:block; font-size:10.5px; color:var(--dim); font-weight:400; }
  td.cell.hi { color:var(--hi); background:#e7f0e7; } td.cell.lo { color:var(--lo); background:#f5e6e6; } td.cell.mid { color:var(--mid); background:#f4eedc; }
  td.cell.empty { color:#c3bdb0; font-weight:400; }
  tr.live td { background:#fbf8ee; }
  .tag { font-family:ui-monospace,monospace; font-size:9.5px; text-transform:uppercase; letter-spacing:.1em;
    color:#8a6d1b; border:1px solid #d8c98f; border-radius:3px; padding:0 4px; vertical-align:middle; }
  .note { font-size:13px; color:#2c281f; background:#efece2; border-left:3px solid var(--ink); padding:12px 16px; margin:14px 0; }
  footer { margin-top:64px; padding-top:18px; border-top:1px solid var(--rule); font-size:12px; color:var(--dim); }
  footer code { font-family:ui-monospace,monospace; }
  .live-badge { font-family:ui-monospace,monospace; font-size:10px; letter-spacing:.04em; color:var(--hi);
    border:1px solid #bcd3bc; border-radius:3px; padding:1px 6px; margin-left:8px; }
  .live-badge.off { color:var(--dim); border-color:var(--rule); }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <p class="kicker">Warrant · outcome-verified · v0 <span id="w-live" class="live-badge" hidden></span></p>
    <h1>Public Reputation Board</h1>
    <p class="sub">Agents ranked by what they actually did — not what they claimed. <a href="/playground.html" style="font-style:normal;font-size:14px">Playground ↗</a></p>
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
