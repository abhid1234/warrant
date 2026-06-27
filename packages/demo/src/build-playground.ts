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
<style>
  :root{--ink:#1a1814;--paper:#f7f5ef;--rule:#d9d4c7;--dim:#7a7468;--hi:#1b5e20;--lo:#7f1d1d;--mid:#8a6d1b;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif;line-height:1.5;-webkit-font-smoothing:antialiased}
  .mono{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:12px}
  .dim{color:var(--dim)} a{color:var(--hi)}
  header{max-width:1080px;margin:0 auto;padding:40px 28px 14px}
  .kicker{text-transform:uppercase;letter-spacing:.18em;font-size:11px;color:var(--dim);margin:0 0 6px}
  h1{font-size:34px;margin:0 0 4px;font-weight:600;letter-spacing:-.01em}
  .sub{font-size:16px;color:#3a352c;font-style:italic;margin:0}
  .toolbar{max-width:1080px;margin:14px auto 0;padding:0 28px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:2px solid var(--ink);padding-bottom:14px}
  .fchip{font-family:ui-monospace,monospace;font-size:11px;border:1px solid var(--rule);background:#fff;border-radius:3px;padding:3px 9px;cursor:pointer;color:#4a443a}
  .fchip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
  .spacer{flex:1}
  .btn{font-family:ui-monospace,monospace;font-size:11px;border:1px solid var(--ink);background:#fff;border-radius:3px;padding:4px 10px;cursor:pointer;color:var(--ink);text-decoration:none}
  .layout{max-width:1080px;margin:0 auto;padding:18px 28px 80px;display:grid;grid-template-columns:300px 1fr;gap:24px}
  .rail{display:flex;flex-direction:column;gap:8px;max-height:78vh;overflow:auto}
  .card{text-align:left;background:#fff;border:1px solid var(--rule);border-radius:5px;padding:10px 12px;cursor:pointer;font-family:inherit}
  .card.on{border-color:var(--ink);box-shadow:inset 3px 0 0 var(--ink)}
  .c-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .c-agent{font-weight:600;font-size:14px} .c-dom{color:var(--dim);margin:2px 0} .c-claim{font-size:12.5px;color:#3a352c}
  .chip{font-family:ui-monospace,monospace;font-size:10.5px;padding:1px 7px;border-radius:3px;color:#fff;white-space:nowrap}
  .chip.warranted{background:var(--hi)} .chip.refuted{background:var(--lo)} .chip.unverifiable{background:#8a8275}
  .banner{border-radius:6px;padding:16px 18px;margin-bottom:18px;border:1px solid var(--rule)}
  .banner.warranted{background:#e7f0e7;border-color:#bcd3bc} .banner.refuted{background:#f5e6e6;border-color:#e0bcbc} .banner.unverifiable{background:#efece2}
  .bigv{font-size:22px;font-weight:600} .banner.warranted .bigv{color:var(--hi)} .banner.refuted .bigv{color:var(--lo)} .banner.unverifiable .bigv{color:#6a6353}
  .bsub{font-size:14px;color:#3a352c;margin-top:2px}
  .vs{display:grid;grid-template-columns:1fr 1.3fr;gap:16px;margin-bottom:18px}
  .vs-col{border:1px solid var(--rule);border-radius:6px;background:#fff;overflow:hidden}
  .vs-h{font-size:11px;text-transform:uppercase;letter-spacing:.1em;padding:8px 12px;border-bottom:1px solid var(--rule);font-weight:600}
  .vs-col.claim .vs-h{color:var(--lo);background:#faf1f1} .vs-col.world .vs-h{color:var(--hi);background:#f0f5f0}
  .vs-body{padding:12px}
  .status{font-size:13px} .summary{font-size:14px;margin:6px 0} .warn{font-size:11.5px;color:var(--lo);font-style:italic;margin-top:8px}
  pre.mono{background:#faf8f2;border:1px solid var(--rule);border-radius:4px;padding:8px;overflow:auto;white-space:pre-wrap;word-break:break-word}
  table.ev{width:100%;border-collapse:collapse;font-size:11.5px} table.ev th{text-align:left;color:var(--dim);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--ink);padding:5px 6px}
  table.ev td{padding:6px;border-bottom:1px solid var(--rule);vertical-align:top;word-break:break-word;overflow-wrap:anywhere;max-width:240px}
  table.ev td.mono{line-height:1.35}
  .indep{color:var(--hi);font-size:9.5px;text-transform:uppercase;letter-spacing:.08em} .self{color:var(--lo);font-size:9.5px;text-transform:uppercase;letter-spacing:.08em}
  .mtag{font-family:ui-monospace,monospace;font-size:10px;padding:1px 6px;border-radius:3px} .mtag.hi{color:var(--hi);background:#e7f0e7} .mtag.lo{color:var(--lo);background:#f5e6e6} .mtag.mid{color:var(--mid);background:#f4eedc}
  .okline{margin-top:8px;font-size:12px;color:var(--dim)}
  .reverify{border-left:3px solid var(--ink);background:#efece2;padding:12px 16px;font-size:13.5px;border-radius:0 4px 4px 0}
  .reverify.bad{border-left-color:var(--lo);background:#f5e6e6} .pass{color:var(--hi);font-weight:600} .fail{color:var(--lo);font-weight:600}
  .reverify ul{margin:6px 0 0;padding-left:18px;font-size:12.5px;color:var(--lo)}
  .controls{display:flex;gap:20px;flex-wrap:wrap;margin:16px 0;font-size:13px;color:#3a352c}
  .controls label{cursor:pointer}
  details.raw{margin-top:8px} details.raw summary{cursor:pointer;font-size:12px;color:var(--dim)}
  .empty{color:var(--dim);font-size:13px;padding:12px}
  @media(max-width:820px){.layout{grid-template-columns:1fr}.vs{grid-template-columns:1fr}}
</style></head>
<body>
<header>
  <p class="kicker">Warrant · playground</p>
  <h1>Verify a claim against the world</h1>
  <p class="sub">Pick a warrant. It's re-verified in your browser — the verdict is re-derived from evidence, never trusted.</p>
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
