// Generates site/playground.html — a static, zero-dep, no-backend interactive
// playground: pick or paste a warrant, see it RE-VERIFIED in the browser with a
// claim-vs-world view, a tamper toggle, and a "drop independent evidence" toggle.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { issueWarrant, issueJudgedWarrant } from "../../verify/src/index.js";
import type { JudgeFn, Party, Warrant } from "../../verify/src/index.js";
import { staticProbe } from "../../verify/src/index.js";
import { allWarrants } from "./scenarios.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..", "..");
const siteDir = join(repoRoot, "site");
const appJs = readFileSync(join(repoRoot, "packages", "demo", "src", "playground.js"), "utf8");

const V: Party = { id: "verifier://warrant-demo", name: "Warrant Verifier", key_id: "k1" };
const keywordJudge = (req: string[]): JudgeFn => async (input) => {
  const hay = JSON.stringify(input.evidence).toLowerCase();
  const miss = req.filter((k) => !hay.includes(k.toLowerCase()));
  return miss.length === 0 ? { match: "match", rationale: `evidence addresses: ${req.join(", ")}` } : { match: "mismatch", rationale: `evidence omits: ${miss.join(", ")}` };
};

async function extras(): Promise<Warrant[]> {
  const out: Warrant[] = [];
  // the REAL GitHub warrant (live-api evidence), committed in examples/
  const gh = JSON.parse(readFileSync(join(repoRoot, "examples", "github-issue.warrant.json"), "utf8")) as Warrant;
  out.push(gh);
  // a refuted variant: same captured real observation, but a fabricated claimed title
  const GH: Party = { id: "https://agents.example/issue-bot/card.json", name: "IssueBot" };
  out.push(
    await issueWarrant(
      { warrant_id: "wrt_pg_gh_lie", issued_at: "2026-06-23T00:00:00Z", issuer: V, subject: GH, task_context: { domain: "github.issue", capability: "open_issue", tags: ["real"] }, intent: { description: "Verify octocat/Hello-World#1 matches the claim." }, claimed_outcome: { status: "COMPLETED", source: "self-report", summary: "Claimed a different title for issue #1.", asserted_facts: { title: "I single-handedly rewrote the kernel", state: "closed" } } },
      [staticProbe("api.github.com", { title: "Edited README via GitHub", state: "closed" })],
    ),
  );
  // judged pair (fuzzy outcome)
  const A: Party = { id: "https://agents.example/patch-pilot/card.json", name: "PatchPilot" };
  for (const [id, body, expectOk] of [
    ["wrt_pg_judge_ok", "Fixes the SQL injection by parameterizing queries — closes the security report.", true],
    ["wrt_pg_judge_lie", "Renamed a few variables and reformatted whitespace.", false],
  ] as Array<[string, string, boolean]>) {
    out.push(
      await issueJudgedWarrant(
        { warrant_id: id, issued_at: "2026-06-23T00:00:00Z", issuer: V, subject: A, task_context: { domain: "code.review", capability: "address_security_fix", tags: ["judged"] }, intent: { description: "Address the reported security issue." }, claimed_outcome: { status: "COMPLETED", source: "self-report", summary: "Addressed the security issue." } },
        { question: "Does the PR body address the security issue?", evidence: [{ source: "github-pr-body", independent: true, observed: body, match: "inconclusive" }] },
        keywordJudge(["security"]),
      ),
    );
    void expectOk;
  }
  // an unverifiable: only the agent's own word, no independent probe
  out.push(
    await issueWarrant(
      { warrant_id: "wrt_pg_unverifiable", issued_at: "2026-06-23T00:00:00Z", issuer: V, subject: { id: "https://agents.example/opaque/card.json", name: "OpaqueAgent" }, task_context: { domain: "ops.deploy", capability: "deploy" }, intent: { description: "Deploy v2 to production." }, claimed_outcome: { status: "COMPLETED", source: "self-report", summary: "Deployed v2 to prod.", asserted_facts: { release: "v2" } } },
      [staticProbe("subject-agent-log", { release: "v2" }, false)],
    ),
  );
  return out;
}

function render(warrants: Warrant[]): string {
  const data = JSON.stringify(warrants);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Warrant — Playground</title>
<meta name="description" content="Verify any warrant in your browser — the verdict is re-derived from evidence, never trusted.">
<meta property="og:type" content="website">
<meta property="og:title" content="Warrant — Playground">
<meta property="og:description" content="Pick or paste a warrant; it's re-verified in your browser. Claim vs. world, a tamper toggle, and the moat made interactive.">
<meta property="og:image" content="https://warrant-gold.vercel.app/og.png">
<meta property="og:url" content="https://warrant-gold.vercel.app/playground">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Warrant — Playground">
<meta name="twitter:description" content="Verify any warrant in your browser. The verdict is re-derived from evidence, never trusted.">
<meta name="twitter:image" content="https://warrant-gold.vercel.app/og.png">
<style>
  :root{--bg:#0b0e14;--bg2:#11151d;--bg3:#171c26;--ink:#e7e9ef;--ink2:#aeb4c0;--dim:#6e7787;--rule:#222834;--hi:#3fb950;--lo:#f85149;--mid:#d29922;--accent:#3fb950;
    --mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,monospace;--sans:system-ui,-apple-system,"Segoe UI",Inter,sans-serif;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased;
    background-image:radial-gradient(70% 50% at 50% -8%, rgba(63,185,80,.07), transparent 72%)}
  .mono{font-family:var(--mono);font-size:12px}
  .dim{color:var(--dim)} a{color:var(--accent)}
  header{max-width:1120px;margin:0 auto;padding:40px 28px 14px}
  .kicker{font-family:var(--mono);text-transform:uppercase;letter-spacing:.2em;font-size:11px;color:var(--dim);margin:0 0 8px}
  h1{font-size:36px;margin:0 0 4px;font-weight:700;letter-spacing:-.02em}
  .sub{font-size:16px;color:var(--ink2);margin:0} .sub b{color:var(--ink);font-weight:600}
  .toolbar{max-width:1120px;margin:14px auto 0;padding:0 28px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--rule);padding-bottom:16px}
  .fchip{font-family:var(--mono);font-size:11px;border:1px solid var(--rule);background:var(--bg2);border-radius:5px;padding:4px 10px;cursor:pointer;color:var(--ink2);transition:.12s}
  .fchip:hover{border-color:#39414f;color:var(--ink)} .fchip.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
  .spacer{flex:1}
  .btn{font-family:var(--mono);font-size:11px;border:1px solid var(--rule);background:var(--bg2);border-radius:5px;padding:5px 11px;cursor:pointer;color:var(--ink);text-decoration:none;transition:.12s}
  .btn:hover{border-color:var(--accent);box-shadow:0 0 12px rgba(63,185,80,.15)}
  .layout{max-width:1120px;margin:0 auto;padding:18px 28px 80px;display:grid;grid-template-columns:300px 1fr;gap:24px}
  .rail{display:flex;flex-direction:column;gap:8px;max-height:80vh;overflow:auto}
  .card{text-align:left;background:var(--bg2);border:1px solid var(--rule);border-radius:8px;padding:11px 13px;cursor:pointer;font-family:inherit;color:var(--ink);transition:.12s}
  .card:hover{border-color:#39414f;background:var(--bg3)} .card.on{border-color:var(--accent);box-shadow:inset 2px 0 0 var(--accent),0 0 14px rgba(63,185,80,.1)}
  .c-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .c-agent{font-weight:600;font-size:14px} .c-dom{color:var(--dim);margin:3px 0;font-family:var(--mono)} .c-claim{font-size:12.5px;color:var(--ink2)}
  .chip{font-family:var(--mono);font-size:10.5px;padding:2px 8px;border-radius:5px;white-space:nowrap;font-weight:500}
  .chip.warranted{color:#c7f7d0;background:rgba(63,185,80,.15);box-shadow:inset 0 0 0 1px rgba(63,185,80,.45)} .chip.refuted{color:#ffd2ce;background:rgba(248,81,73,.15);box-shadow:inset 0 0 0 1px rgba(248,81,73,.45)} .chip.unverifiable{color:#cfd3dc;background:rgba(139,143,154,.16);box-shadow:inset 0 0 0 1px rgba(139,143,154,.4)}
  .banner{border-radius:10px;padding:18px 20px;margin-bottom:18px;border:1px solid var(--rule);background:var(--bg2)}
  .banner.warranted{border-color:rgba(63,185,80,.4);box-shadow:0 0 34px rgba(63,185,80,.09),inset 0 0 0 1px rgba(63,185,80,.12)} .banner.refuted{border-color:rgba(248,81,73,.4);box-shadow:0 0 34px rgba(248,81,73,.09),inset 0 0 0 1px rgba(248,81,73,.12)} .banner.unverifiable{border-color:rgba(139,143,154,.35)}
  .bigv{font-size:24px;font-weight:700;letter-spacing:-.01em} .banner.warranted .bigv{color:var(--hi)} .banner.refuted .bigv{color:var(--lo)} .banner.unverifiable .bigv{color:var(--ink2)}
  .bsub{font-size:14px;color:var(--ink2);margin-top:4px}
  .vs{display:grid;grid-template-columns:1fr 1.3fr;gap:16px;margin-bottom:18px}
  .vs-col{border:1px solid var(--rule);border-radius:10px;background:var(--bg2);overflow:hidden}
  .vs-h{font-family:var(--mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.1em;padding:9px 14px;border-bottom:1px solid var(--rule);font-weight:600}
  .vs-col.claim .vs-h{color:var(--lo);background:rgba(248,81,73,.07)} .vs-col.world .vs-h{color:var(--hi);background:rgba(63,185,80,.07)}
  .vs-body{padding:14px}
  .status{font-size:13px;color:var(--ink2)} .summary{font-size:14px;margin:6px 0;color:var(--ink)} .warn{font-size:11.5px;color:var(--lo);margin-top:10px;font-family:var(--mono)}
  pre.mono{background:var(--bg);border:1px solid var(--rule);border-radius:6px;padding:10px;overflow:auto;white-space:pre-wrap;word-break:break-word;color:var(--ink2)}
  table.ev{width:100%;border-collapse:collapse;font-size:11.5px} table.ev th{text-align:left;color:var(--dim);font-weight:500;font-size:10px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--rule);padding:6px;font-family:var(--mono)}
  table.ev td{padding:7px 6px;border-bottom:1px solid var(--rule);vertical-align:top;word-break:break-word;overflow-wrap:anywhere;max-width:240px} table.ev tr:last-child td{border-bottom:none}
  table.ev td.mono{line-height:1.4;color:var(--ink2)}
  .indep{color:var(--hi);font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-family:var(--mono)} .self{color:var(--lo);font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-family:var(--mono)}
  .mtag{font-family:var(--mono);font-size:10px;padding:1px 7px;border-radius:4px;white-space:nowrap} .mtag.hi{color:var(--hi);background:rgba(63,185,80,.14)} .mtag.lo{color:var(--lo);background:rgba(248,81,73,.14)} .mtag.mid{color:var(--mid);background:rgba(210,153,34,.14)}
  .okline{margin-top:10px;font-size:12px;color:var(--dim);font-family:var(--mono)}
  .reverify{border:1px solid var(--rule);border-left:2px solid var(--accent);background:var(--bg2);padding:13px 16px;font-size:13.5px;border-radius:0 8px 8px 0;color:var(--ink2)}
  .reverify.bad{border-left-color:var(--lo)} .pass{color:var(--hi);font-weight:600} .fail{color:var(--lo);font-weight:600}
  .reverify ul{margin:8px 0 0;padding-left:18px;font-size:12.5px;color:var(--lo);font-family:var(--mono)}
  .controls{display:flex;gap:22px;flex-wrap:wrap;margin:18px 0;font-size:13px;color:var(--ink2)}
  .controls label{cursor:pointer} .controls input{accent-color:var(--accent)}
  details.raw{margin-top:10px} details.raw summary{cursor:pointer;font-size:12px;color:var(--dim);font-family:var(--mono)}
  .empty{color:var(--dim);font-size:13px;padding:12px}
  @media(max-width:820px){.layout{grid-template-columns:1fr}.vs{grid-template-columns:1fr}}
</style></head>
<body>
<header>
  <p class="kicker">Warrant · playground</p>
  <h1>Verify a claim against the world</h1>
  <p class="sub">Your agent says it booked the flight — <b>did it?</b> Pick a warrant; it's re-verified in your browser, the verdict re-derived from evidence, never trusted.</p>
</header>
<div class="toolbar">
  <span class="fchip on" data-f="all">all</span>
  <span class="fchip" data-f="warranted">warranted</span>
  <span class="fchip" data-f="refuted">refuted</span>
  <span class="fchip" data-f="unverifiable">unverifiable</span>
  <span class="fchip" data-f="real">real</span>
  <span class="fchip" data-f="judged">judged</span>
  <span class="spacer"></span>
  <button class="btn" id="btn-paste">Verify yours ↑</button>
  <a class="btn" href="/">Board ↗</a>
</div>
<div class="layout">
  <aside id="cards" class="rail"></aside>
  <main id="inspector"></main>
</div>
<script>window.__WARRANTS__=${data};</script>
<script>${appJs}</script>
</body></html>
`;
}

(async () => {
  const warrants = [...(await allWarrants()), ...(await extras())];
  mkdirSync(siteDir, { recursive: true });
  writeFileSync(join(siteDir, "playground.html"), render(warrants));
  console.log(`playground written: site/playground.html  (${warrants.length} warrants)`);
})();
