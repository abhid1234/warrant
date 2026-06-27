// Judged verification (method: "judge") for a FUZZY outcome a structural probe
// can't decide: "did the PR actually address the security fix it claims?" The
// judge reasons over INDEPENDENT evidence (the real PR body), not the agent's
// word. Uses a deterministic local judge so it runs offline; geminiJudge() in
// @warrant/verify is the real LLM adapter (set GEMINI_API_KEY to use it).
//   npm run judge
import { issueJudgedWarrant } from "../../verify/src/index.js";
import type { JudgeFn, Party, Warrant } from "../../verify/src/index.js";

const GREEN = "\x1b[32m", RED = "\x1b[31m", DIM = "\x1b[2m", BOLD = "\x1b[1m", OFF = "\x1b[0m";
const VERIFIER: Party = { id: "verifier://warrant-demo", name: "Warrant Verifier", key_id: "k1" };
const AGENT: Party = { id: "https://agents.example/patch-pilot/card.json", name: "PatchPilot" };

/** Deterministic judge: does the independent evidence actually cover the topic? */
function keywordJudge(required: string[]): JudgeFn {
  return async (input) => {
    const hay = JSON.stringify(input.evidence).toLowerCase();
    const missing = required.filter((k) => !hay.includes(k.toLowerCase()));
    return missing.length === 0
      ? { match: "match", rationale: `evidence addresses: ${required.join(", ")}` }
      : { match: "mismatch", rationale: `evidence omits: ${missing.join(", ")}` };
  };
}

async function judged(id: string, name: string, claimSummary: string, prBody: string): Promise<Warrant> {
  return issueJudgedWarrant(
    {
      warrant_id: id,
      issued_at: "2026-06-23T00:00:00Z",
      issuer: VERIFIER,
      subject: AGENT,
      task_context: { domain: "code.review", capability: "address_security_fix" },
      intent: { description: "The PR must actually address the reported security issue." },
      claimed_outcome: { status: "COMPLETED", source: "self-report", summary: claimSummary },
    },
    {
      question: "Does the PR body address the reported security issue?",
      // INDEPENDENT evidence: the real PR body. Structurally inconclusive — fuzzy.
      evidence: [{ source: "github-pr-body", independent: true, observed: prBody, match: "inconclusive" }],
    },
    keywordJudge(["security"]),
  );
}

function show(label: string, w: Warrant): void {
  const judge = w.verification.evidence[w.verification.evidence.length - 1];
  const v = w.verdict.value;
  const mark = v === "warranted" ? `${GREEN}✓ WARRANTED` : `${RED}✗ REFUTED`;
  console.log(`${BOLD}${label}${OFF}`);
  console.log(`  ${DIM}claim:${OFF}  "${w.claimed_outcome.summary}"`);
  console.log(`  ${DIM}judge:${OFF}  ${judge.observed}  →  ${judge.match}`);
  console.log(`  ${mark}${OFF}  ${w.verdict.reasoning}\n`);
}

(async () => {
  console.log(`\n${BOLD}Warrant — judged verification${OFF}  ${DIM}fuzzy outcome, decided over independent evidence${OFF}\n`);
  const honest = await judged("wrt_judge_ok", "ok", "Addressed the security issue.", "Fixes the SQL injection by parameterizing queries — closes the security report.");
  show("Honest — PR actually addresses security", honest);
  const lying = await judged("wrt_judge_lie", "lie", "Addressed the security issue.", "Renamed a few variables and reformatted whitespace.");
  show("Lie — PR claims a security fix it didn't make", lying);

  const ok = honest.verdict.value === "warranted" && lying.verdict.value === "refuted";
  if (!ok) { console.error(`${RED}FAILED${OFF}`); process.exit(1); }
  console.log(`${DIM}The judge reasoned over the real PR body, not the agent's claim. geminiJudge() does this with an LLM.${OFF}\n`);
})();
