// Zero-dependency test harness (Node built-ins only). Run with:
//   npm test   (tsc -p tsconfig.json && node dist/test/run.js)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { compare } from "../src/probe.js";
import type { Probe } from "../src/probe.js";
import { issueWarrant, verifyWarrant } from "../src/verify.js";
import { validate } from "../src/validate.js";
import { validateAgainstSchema } from "../src/schema-validate.js";
import { tallyReputation } from "../src/reputation.js";
import { generateKeypair, signWarrant, verifySignature } from "../src/sign.js";
import type { ClaimedOutcome, Intent, Party, TaskContext, Warrant } from "../src/types.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const examples = join(repoRoot, "examples");

let pass = 0;
let fail = 0;
const tests: Array<[string, () => void | Promise<void>]> = [];
const test = (name: string, fn: () => void | Promise<void>): void => {
  tests.push([name, fn]);
};

// ---- shared fixtures -------------------------------------------------------
const issuer: Party = { id: "verifier://test", name: "Test Verifier", key_id: "k1" };
const subject: Party = { id: "agent://booker", name: "Booker" };
const intent: Intent = {
  description: "Book SFO->JFK 2026-07-01 for Alex Rivera",
  success_criteria: ["A confirmed PNR exists for this passenger and itinerary."],
};
const taskContext: TaskContext = { domain: "travel.booking", capability: "book_flight" };
const base = {
  warrant_id: "wrt_test",
  issued_at: "2026-06-22T00:00:00Z",
  issuer,
  subject,
  task_context: taskContext,
  intent,
};

// An INDEPENDENT airline system the subject does not control.
const airlineProbe = (record: unknown): Probe => ({
  source: "amadeus-pnr-api",
  independent: true,
  run: async () => ({ observed: record, probe: "GET /pnr/<claimed>" }),
});

// ---- the world-state check decides the verdict -----------------------------
test("honest agent -> warranted", async () => {
  const claim: ClaimedOutcome = { status: "COMPLETED", source: "self-report", asserted_facts: { pnr: "X7K2QL", seat: "14C" } };
  const w = await issueWarrant({ ...base, claimed_outcome: claim }, [
    airlineProbe({ pnr: "X7K2QL", seat: "14C", status: "CONFIRMED" }),
  ]);
  assert.equal(w.verdict.value, "warranted");
});

// ACCEPTANCE (CLAUDE.md Phase 2): claimed outcome + probe -> correct verdict on a lying agent.
test("LYING agent -> refuted (acceptance)", async () => {
  const claim: ClaimedOutcome = { status: "COMPLETED", source: "self-report", asserted_facts: { pnr: "QZ99WT" } };
  const w = await issueWarrant({ ...base, claimed_outcome: claim }, [
    airlineProbe({ status: "NOT_FOUND" }), // the reservation simply isn't there
  ]);
  assert.equal(w.verdict.value, "refuted");
  // and the trace is NOT what decided it — the independent probe did:
  assert.equal(w.verification.evidence[0].independent, true);
  assert.equal(w.verification.evidence[0].match, "absent");
});

test("self-reported evidence alone -> unverifiable (the moat holds)", async () => {
  const claim: ClaimedOutcome = { status: "COMPLETED", source: "self-report", asserted_facts: { pnr: "X7K2QL" } };
  const selfReport: Probe = {
    source: "subject-agent-log",
    independent: false, // the agent's own word
    run: async () => ({ observed: { pnr: "X7K2QL" } }),
  };
  const w = await issueWarrant({ ...base, claimed_outcome: claim }, [selfReport]);
  assert.equal(w.verdict.value, "unverifiable");
});

test("no probe / no independent check -> unverifiable", async () => {
  const claim: ClaimedOutcome = { status: "COMPLETED", source: "self-report", asserted_facts: { pnr: "X" } };
  const w = await issueWarrant({ ...base, claimed_outcome: claim }, []);
  assert.equal(w.verdict.value, "unverifiable");
});

test("self-warranting is refused", async () => {
  const claim: ClaimedOutcome = { status: "COMPLETED", source: "self-report" };
  let threw = false;
  try {
    await issueWarrant({ ...base, subject: issuer, claimed_outcome: claim }, []);
  } catch {
    threw = true;
  }
  assert.ok(threw, "issuer === subject must throw");
});

// ---- compare() unit cases --------------------------------------------------
test("compare: all keys match -> match", () => {
  assert.equal(compare({ a: 1, b: 2, c: 3 }, { a: 1, b: 2 }), "match");
});
test("compare: missing all keys -> absent", () => {
  assert.equal(compare({ status: "NOT_FOUND" }, { pnr: "X" }), "absent");
});
test("compare: present but wrong -> mismatch", () => {
  assert.equal(compare({ pnr: "WRONG" }, { pnr: "X" }), "mismatch");
});
test("compare: null observed -> absent", () => {
  assert.equal(compare(null, { pnr: "X" }), "absent");
});
test("compare: no expectation -> inconclusive", () => {
  assert.equal(compare({ a: 1 }, undefined), "inconclusive");
});

// ---- re-verify the hand-authored examples ----------------------------------
test("example: flight-booking.warrant.json re-verifies as warranted", () => {
  const w = JSON.parse(readFileSync(join(examples, "flight-booking.warrant.json"), "utf8")) as Warrant;
  const r = verifyWarrant(w);
  assert.ok(r.ok, "errors: " + r.errors.join("; "));
  assert.equal(r.derivedVerdict.value, "warranted");
});
test("example: flight-booking-lied.warrant.json re-verifies as refuted", () => {
  const w = JSON.parse(readFileSync(join(examples, "flight-booking-lied.warrant.json"), "utf8")) as Warrant;
  const r = verifyWarrant(w);
  assert.ok(r.ok, "errors: " + r.errors.join("; "));
  assert.equal(r.derivedVerdict.value, "refuted");
});

test("tampered stated verdict is rejected on re-verify", () => {
  const w = JSON.parse(readFileSync(join(examples, "flight-booking-lied.warrant.json"), "utf8")) as Warrant;
  w.verdict.value = "warranted"; // attacker flips the stamp
  const r = verifyWarrant(w);
  assert.ok(!r.ok, "flipped verdict must be rejected");
});

// ---- validate() ------------------------------------------------------------
test("validate flags a self-warranting doc", () => {
  const w = JSON.parse(readFileSync(join(examples, "flight-booking.warrant.json"), "utf8")) as Warrant;
  (w as Warrant).subject = { id: w.issuer.id };
  assert.equal(validate(w).valid, false);
});

// ---- non-crypto signature round trip ---------------------------------------
test("Ed25519 sign/verify round trip + tamper detection", async () => {
  const { publicKey, privateKey } = generateKeypair();
  const claim: ClaimedOutcome = { status: "COMPLETED", source: "self-report", asserted_facts: { pnr: "X7K2QL" } };
  const w = await issueWarrant({ ...base, claimed_outcome: claim }, [airlineProbe({ pnr: "X7K2QL" })]);
  const signed = signWarrant(w, privateKey, "k1");
  assert.ok(verifySignature(signed, publicKey), "valid signature should verify");
  const tampered = { ...signed, verdict: { ...signed.verdict, value: "refuted" as const } };
  assert.ok(!verifySignature(tampered, publicKey), "tampered warrant must fail signature");
});

// ---- JSON schema validation (schema file is the source of truth) -----------
const loadSchema = (): Record<string, unknown> => JSON.parse(readFileSync(join(repoRoot, "schema", "warrant-0.schema.json"), "utf8"));

test("schema: both example warrants validate against warrant-0", () => {
  const schema = loadSchema();
  for (const f of ["flight-booking.warrant.json", "flight-booking-lied.warrant.json"]) {
    const w = JSON.parse(readFileSync(join(examples, f), "utf8"));
    const r = validateAgainstSchema(w, schema);
    assert.ok(r.valid, `${f}: ` + r.errors.join("; "));
  }
});
test("schema: missing verification.evidence is rejected", () => {
  const w = JSON.parse(readFileSync(join(examples, "flight-booking.warrant.json"), "utf8")) as Warrant;
  (w.verification as { evidence?: unknown }).evidence = [];
  assert.equal(validateAgainstSchema(w, loadSchema()).valid, false);
});
test("schema: bad verdict enum is rejected", () => {
  const w = JSON.parse(readFileSync(join(examples, "flight-booking.warrant.json"), "utf8")) as Warrant;
  (w.verdict as { value: string }).value = "definitely";
  assert.equal(validateAgainstSchema(w, loadSchema()).valid, false);
});

// ---- reputation (context-conditioned) --------------------------------------
test("reputation: tallies per domain from warrants", () => {
  const green = JSON.parse(readFileSync(join(examples, "flight-booking.warrant.json"), "utf8")) as Warrant;
  const red = JSON.parse(readFileSync(join(examples, "flight-booking-lied.warrant.json"), "utf8")) as Warrant;
  const rep = tallyReputation([green, red]);
  assert.equal(rep.totals.warranted, 1);
  assert.equal(rep.totals.refuted, 1);
  const travel = rep.domains.find((d) => d.domain === "travel.booking");
  assert.ok(travel, "travel.booking domain present");
  const tb = travel!.agents.find((a) => a.name === "TravelBooker");
  const cb = travel!.agents.find((a) => a.name === "CheapBooker");
  assert.equal(tb?.score, 1);
  assert.equal(cb?.score, 0);
});

// ---- real HTTP probe (v3) --------------------------------------------------
import { createServer } from "node:http";
import { httpJsonProbe, queryProbe, githubIssueProbe, staticProbe } from "../src/probes.js";

test("httpJsonProbe issues a correct verdict against a live endpoint", async () => {
  // A loopback "airline" that knows exactly one reservation.
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/pnr/X7K2QL") res.end(JSON.stringify({ pnr: "X7K2QL", status: "CONFIRMED" }));
    else { res.statusCode = 404; res.end(JSON.stringify({ error: "not found" })); }
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = server.address()!.port;
  try {
    // honest claim -> warranted
    const ok = await issueWarrant(
      { ...base, warrant_id: "w_http_ok", claimed_outcome: { status: "COMPLETED", source: "self-report", asserted_facts: { pnr: "X7K2QL" } } },
      [httpJsonProbe({ url: `http://127.0.0.1:${port}/pnr/X7K2QL`, source: "airline" })],
    );
    assert.equal(ok.verdict.value, "warranted");
    // lying claim -> the endpoint 404s -> absent -> refuted
    const lie = await issueWarrant(
      { ...base, warrant_id: "w_http_lie", claimed_outcome: { status: "COMPLETED", source: "self-report", asserted_facts: { pnr: "NOPE99" } } },
      [httpJsonProbe({ url: `http://127.0.0.1:${port}/pnr/NOPE99`, source: "airline" })],
    );
    assert.equal(lie.verdict.value, "refuted");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("githubIssueProbe verifies title+state against a GitHub-shaped endpoint", async () => {
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/repos/o/r/issues/1") res.end(JSON.stringify({ number: 1, title: "Edited README via GitHub", state: "closed", body: "ignored" }));
    else { res.statusCode = 404; res.end(JSON.stringify({ message: "Not Found" })); }
  });
  await new Promise<void>((r) => server.listen(0, r));
  const baseUrl = `http://127.0.0.1:${server.address()!.port}`;
  try {
    const good = await issueWarrant(
      { ...base, warrant_id: "gh1", claimed_outcome: { status: "COMPLETED", source: "self-report", asserted_facts: { title: "Edited README via GitHub", state: "closed" } } },
      [githubIssueProbe("o", "r", 1, { baseUrl })],
    );
    assert.equal(good.verdict.value, "warranted");
    const fake = await issueWarrant(
      { ...base, warrant_id: "gh2", claimed_outcome: { status: "COMPLETED", source: "self-report", asserted_facts: { title: "nope", state: "open" } } },
      [githubIssueProbe("o", "r", 99999, { baseUrl })],
    );
    assert.equal(fake.verdict.value, "refuted");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("queryProbe takes an injected lookup", async () => {
  const w = await issueWarrant(
    { ...base, warrant_id: "w_q", claimed_outcome: { status: "COMPLETED", source: "self-report", asserted_facts: { row: 7 } } },
    [queryProbe({ source: "postgres:orders", run: () => ({ row: 7 }) })],
  );
  assert.equal(w.verdict.value, "warranted");
});

// ---- source provenance + freshness (trust-model gaps) ----------------------
test("recognizedSource grounds the independent flag", async () => {
  const claim: ClaimedOutcome = { status: "COMPLETED", source: "self-report", asserted_facts: { id: "X" } };
  const w = await issueWarrant({ ...base, warrant_id: "rs1", claimed_outcome: claim }, [staticProbe("airline-system", { id: "X" })]);
  assert.equal(w.verdict.value, "warranted"); // default trusts the flag
  // consumer recognizes a different source -> airline-system isn't independent -> unverifiable
  const r = verifyWarrant(w, { recognizedSource: (s) => s === "stripe" });
  assert.equal(r.derivedVerdict.value, "unverifiable");
  assert.ok(!r.ok);
  // recognizing the actual source -> warranted, ok
  const r2 = verifyWarrant(w, { recognizedSource: (s) => s === "airline-system" });
  assert.equal(r2.derivedVerdict.value, "warranted");
  assert.ok(r2.ok);
});

test("freshness window rejects stale and future warrants", async () => {
  const claim: ClaimedOutcome = { status: "COMPLETED", source: "self-report", asserted_facts: { id: "X" } };
  const w = await issueWarrant({ ...base, warrant_id: "fr1", issued_at: "2020-01-01T00:00:00Z", claimed_outcome: claim }, [staticProbe("ledger", { id: "X" })]);
  const stale = verifyWarrant(w, { maxAgeMs: 60_000, nowMs: Date.parse("2026-06-23T00:00:00Z") });
  assert.ok(!stale.ok && stale.errors.some((e) => /stale/.test(e)));
  const fresh = verifyWarrant(w, { maxAgeMs: 60_000, nowMs: Date.parse("2020-01-01T00:00:30Z") });
  assert.ok(fresh.ok);
});

// ---- cross-harness portability (v2) ----------------------------------------
import { tallyByHarness, harnessOf } from "../src/reputation.js";

test("portable reputation aggregates one agent across harnesses", async () => {
  const claim: ClaimedOutcome = { status: "COMPLETED", source: "self-report", asserted_facts: { id: "A1" } };
  const probe: Probe = { source: "ledger", independent: true, run: async () => ({ observed: { id: "A1" } }) };
  const mk = async (wid: string, harness: string): Promise<Warrant> =>
    issueWarrant(
      { ...base, warrant_id: wid, claimed_outcome: claim, body: { ot_version: "0.1", harness: { name: harness } } },
      [probe],
    );
  const a = await mk("w_cc", "claude-code");
  const b = await mk("w_lg", "langgraph");
  assert.equal(harnessOf(a), "claude-code");

  const rep = tallyReputation([a, b]);
  assert.deepEqual(rep.harnesses, ["claude-code", "langgraph"]);
  const agent = rep.domains[0].agents[0];
  assert.equal(agent.score, 1); // one portable score
  assert.deepEqual(agent.harnesses, ["claude-code", "langgraph"]); // from both harnesses

  const byH = tallyByHarness([a, b]);
  assert.equal(byH.length, 2);
  assert.ok(byH.every((r) => r.score === 1)); // identical verdict across harnesses
});

// ---- N-of-M consensus + verifier reputation --------------------------------
import { consensusVerdict, verifierStandings } from "../src/consensus.js";
import { issueJudgedWarrant } from "../src/verify.js";

function voteWarrant(issuerId: string, value: "warranted" | "refuted", asserted: Record<string, unknown> = { id: "T" }): Warrant {
  return {
    warrant_version: "0", warrant_id: `${issuerId}-${value}`, issued_at: "2026-06-23T00:00:00Z",
    issuer: { id: issuerId, name: issuerId }, subject: { id: "agent://s", name: "S" },
    task_context: { domain: "d" }, intent: { description: "t" },
    claimed_outcome: { status: "COMPLETED", source: "self-report", asserted_facts: asserted },
    verification: { method: "world-state-probe", checked_at: "2026-06-23T00:00:00Z", evidence: [{ source: "x", independent: true, observed: {}, match: value === "warranted" ? "match" : "absent" }] },
    verdict: { value, reasoning: "r" },
  };
}

test("consensus: N independent issuers agree -> consensus; disagreement -> disputed", () => {
  assert.equal(consensusVerdict([voteWarrant("v1", "warranted"), voteWarrant("v2", "warranted")], { n: 2 }).value, "warranted");
  assert.equal(consensusVerdict([voteWarrant("v1", "refuted"), voteWarrant("v2", "refuted")], { n: 2 }).value, "refuted");
  assert.equal(consensusVerdict([voteWarrant("v1", "warranted"), voteWarrant("v2", "refuted")], { n: 2 }).value, "disputed");
  assert.equal(consensusVerdict([voteWarrant("v1", "warranted")], { n: 2 }).value, "unverifiable"); // not enough
});

test("verifier reputation: a verifier outvoted by peer consensus loses standing", () => {
  // v1 & v2 warrant the outcome; v3 refutes -> v3 is outvoted.
  const standings = verifierStandings([voteWarrant("v1", "warranted"), voteWarrant("v2", "warranted"), voteWarrant("v3", "refuted")], { n: 2 });
  const v3 = standings.find((s) => s.issuerId === "v3");
  assert.equal(v3?.outvoted, 1);
  assert.equal(v3?.score, 0);
});

test("reputation confidence: fewer wins => lower Wilson confidence than many wins", () => {
  const few = tallyReputation([voteWarrant("v1", "warranted")]).domains[0].agents[0];
  const many = tallyReputation(Array.from({ length: 20 }, (_, i) => ({ ...voteWarrant("v1", "warranted"), warrant_id: "w" + i }))).domains[0].agents[0];
  assert.ok(many.confidence > few.confidence, `${many.confidence} should exceed ${few.confidence}`);
  assert.ok(few.confidence < 1 && many.confidence < 1);
});

test("issueJudgedWarrant: fuzzy outcome judged over evidence", async () => {
  const mk = (m: "match" | "mismatch") =>
    issueJudgedWarrant(
      { warrant_id: "j_" + m, issued_at: "2026-06-23T00:00:00Z", issuer, subject, task_context: { domain: "code.review" }, intent: { description: "addresses fix" }, claimed_outcome: { status: "COMPLETED", source: "self-report" } },
      { question: "addressed?", evidence: [{ source: "pr-body", independent: true, observed: "text", match: "inconclusive" }] },
      async () => ({ match: m, rationale: "stub" }),
    );
  assert.equal((await mk("match")).verdict.value, "warranted");
  assert.equal((await mk("mismatch")).verdict.value, "refuted");
});

// ---- runner ----------------------------------------------------------------
(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log("ok   - " + name);
      pass++;
    } catch (e) {
      console.error("FAIL - " + name + "\n       " + (e as Error).message);
      fail++;
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
