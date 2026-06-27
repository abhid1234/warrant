// A REAL world-state verification (not a fixture). An agent claims it did
// something to a GitHub issue; Warrant checks the claim against the LIVE GitHub
// API and issues a genuine warrant. Target: octocat/Hello-World#1 — a canonical,
// stable public issue ("Edited README via GitHub", state closed).
//   npm run github
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { issueWarrant, signWarrant, generateKeypair, githubIssueProbe } from "../../verify/src/index.js";
import type { Party, Warrant } from "../../verify/src/index.js";

const GREEN = "\x1b[32m", RED = "\x1b[31m", DIM = "\x1b[2m", BOLD = "\x1b[1m", OFF = "\x1b[0m";
const VERIFIER: Party = { id: "verifier://warrant-demo", name: "Warrant Verifier", key_id: "k1" };
const AGENT: Party = { id: "https://agents.example/issue-bot/card.json", name: "IssueBot" };
const OWNER = "octocat", REPO = "Hello-World";

async function check(id: string, issueNum: number, asserted: Record<string, unknown>, summary: string): Promise<Warrant> {
  return issueWarrant(
    {
      warrant_id: id,
      issued_at: "2026-06-23T00:00:00Z",
      issuer: VERIFIER,
      subject: AGENT,
      task_context: { domain: "github.issue", capability: "open_issue", tags: ["real"] },
      intent: {
        description: `Verify issue ${OWNER}/${REPO}#${issueNum} matches the claim.`,
        success_criteria: ["The issue exists on GitHub with the claimed title and state."],
      },
      claimed_outcome: { status: "COMPLETED", source: "self-report", summary, asserted_facts: asserted },
    },
    [githubIssueProbe(OWNER, REPO, issueNum)],
  );
}

function show(label: string, w: Warrant): void {
  const ev = w.verification.evidence[0];
  const v = w.verdict.value;
  const mark = v === "warranted" ? `${GREEN}✓ WARRANTED` : `${RED}✗ REFUTED`;
  console.log(`${BOLD}${label}${OFF}`);
  console.log(`  ${DIM}claim:${OFF}    ${JSON.stringify(w.claimed_outcome.asserted_facts)}`);
  console.log(`  ${DIM}probe:${OFF}    ${ev.probe} ${DIM}(live, independent)${OFF}`);
  console.log(`  ${DIM}observed:${OFF} ${JSON.stringify(ev.observed)}  →  ${ev.match}`);
  console.log(`  ${mark}${OFF}  ${w.verdict.reasoning}\n`);
}

(async () => {
  console.log(`\n${BOLD}Warrant — REAL world-state verification${OFF}  ${DIM}against the live GitHub API${OFF}\n`);

  // 1. HONEST: the claim matches the real issue -> warranted.
  const honest = await check("wrt_gh_honest", 1, { title: "Edited README via GitHub", state: "closed" }, "Confirmed issue #1.");
  show("Honest claim (octocat/Hello-World#1)", honest);

  // 2. WRONG TITLE: real issue, fabricated title -> mismatch -> refuted.
  const wrong = await check("wrt_gh_wrongtitle", 1, { title: "I single-handedly rewrote the kernel", state: "closed" }, "Claimed a different title for #1.");
  show("Lie — wrong title for a real issue", wrong);

  // 3. FAKE ISSUE: doesn't exist -> 404 -> absent -> refuted.
  const fake = await check("wrt_gh_fakeissue", 999999999, { title: "My imaginary issue", state: "open" }, "Claimed a non-existent issue.");
  show("Lie — issue that doesn't exist", fake);

  // Persist the honest one as a GENUINE (non-illustrative) warrant.
  const { privateKey } = generateKeypair();
  const signed = signWarrant(honest, privateKey, "k1");
  const out = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "examples", "github-issue.warrant.json");
  writeFileSync(out, JSON.stringify(signed, null, 2) + "\n");
  console.log(`${DIM}Wrote a real warrant (live GitHub evidence) to examples/github-issue.warrant.json${OFF}`);

  const ok = honest.verdict.value === "warranted" && wrong.verdict.value === "refuted" && fake.verdict.value === "refuted";
  if (!ok) { console.error(`\n${RED}FAILED: unexpected verdicts${OFF}`); process.exit(1); }
  console.log(`\n${GREEN}OK${OFF} ${DIM}— a real claim verified against real ground truth, not a fixture.${OFF}\n`);
})();
