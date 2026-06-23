// v2 — cross-harness portable reputation. ONE agent (OmniRefund) does the same
// kind of task under TWO different harnesses (Claude-Code-style and
// LangGraph-style). Each run normalizes to the same OpenTrajectory warrant body,
// each is verified against the same independent ledger probe, and the resulting
// warrants roll into ONE portable reputation keyed by agent identity — not by
// harness. Acceptance (Phase 4): same warrant format across harnesses.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  issueWarrant,
  validateAgainstSchema,
  tallyReputation,
  tallyByHarness,
  formatReputation,
  formatByHarness,
} from "../../verify/src/index.js";
import type { Party, Probe, Warrant } from "../../verify/src/index.js";
import { fromClaudeCode, fromLangGraph } from "./harnesses.js";

const VERIFIER: Party = { id: "verifier://warrant-demo", name: "Warrant Verifier", key_id: "demo-ed25519-1" };
const CONCIERGE: Party = { id: "https://agents.example/concierge/card.json", name: "Concierge" };
const OmniRefund: Party = { id: "https://agents.example/omni-refund/card.json", name: "OmniRefund" };

// Independent payments ledger — the ground truth, same for every harness.
function ledgerProbe(refundId: string, settled: Record<string, { amount: number }>): Probe {
  return {
    source: "stripe-refunds-api",
    independent: true,
    run: async () => ({
      observed: settled[refundId] ? { refund_id: refundId, amount: settled[refundId].amount, status: "SETTLED" } : { status: "NOT_FOUND" },
      probe: `GET /refunds/${refundId}`,
    }),
  };
}

/** Two warrants for the SAME agent, produced from two different harnesses. */
export async function crossHarnessWarrants(): Promise<Warrant[]> {
  const ledger = { RX1: { amount: 25 }, RX2: { amount: 25 } };
  const intent = { description: "Refund order #7001 ($25)", success_criteria: ["A settled refund exists in the payments ledger."] };

  // Harness A — Claude-Code-style transcript.
  const bodyA = fromClaudeCode({
    trajectory_id: "omni-cc-7001",
    task: "Refund order #7001 ($25)",
    events: [
      { kind: "user", text: "Refund order #7001 ($25)." },
      { kind: "tool", tool: "issue_refund", args: { order: "#7001", amount: 25 }, result: "refund RX1 settled", ok: true },
      { kind: "assistant", text: "Refunded $25 (RX1)." },
    ],
  });
  const wA = await issueWarrant(
    {
      warrant_id: "wrt_omni_cc",
      issued_at: "2026-06-22T19:00:00Z",
      issuer: VERIFIER,
      subject: OmniRefund,
      caller: CONCIERGE,
      task_context: { domain: "payments.refund", capability: "issue_refund", tags: ["cross-harness"] },
      intent,
      claimed_outcome: { status: "COMPLETED", source: "self-report", summary: "Refunded $25 (RX1).", asserted_facts: { refund_id: "RX1", amount: 25 } },
      body: bodyA,
    },
    [ledgerProbe("RX1", ledger)],
  );

  // Harness B — LangGraph-style node trace (same agent identity, same format out).
  const bodyB = fromLangGraph({
    thread_id: "omni-lg-7002",
    goal: "Refund order #7002 ($25)",
    nodes: [
      { node: "plan", output: "Will issue refund." },
      { node: "act", tool_calls: [{ name: "issue_refund", input: { order: "#7002", amount: 25 }, output: "refund RX2 settled" }] },
      { node: "respond", output: "Refunded $25 (RX2)." },
    ],
  });
  const wB = await issueWarrant(
    {
      warrant_id: "wrt_omni_lg",
      issued_at: "2026-06-22T19:05:00Z",
      issuer: VERIFIER,
      subject: OmniRefund,
      caller: CONCIERGE,
      task_context: { domain: "payments.refund", capability: "issue_refund", tags: ["cross-harness"] },
      intent: { description: "Refund order #7002 ($25)", success_criteria: intent.success_criteria },
      claimed_outcome: { status: "COMPLETED", source: "self-report", summary: "Refunded $25 (RX2).", asserted_facts: { refund_id: "RX2", amount: 25 } },
      body: bodyB,
    },
    [ledgerProbe("RX2", ledger)],
  );

  return [wA, wB];
}

// ---- console demo ----------------------------------------------------------
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const OFF = "\x1b[0m";

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const schemaPath = join(here, "..", "..", "..", "..", "..", "schema", "warrant-0.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;

  const warrants = await crossHarnessWarrants();

  console.log(`\n${BOLD}Warrant — cross-harness portable reputation${OFF}`);
  console.log(`${DIM}One agent (OmniRefund) runs the same task under two harnesses.${OFF}\n`);

  for (const w of warrants) {
    const h = (w.body as { harness?: { name?: string } })?.harness?.name ?? "?";
    const valid = validateAgainstSchema(w, schema).valid;
    console.log(`  ${h.padEnd(11)} → ${w.verdict.value}   ${DIM}same warrant format: ${valid ? "valid" : "INVALID"}${OFF}`);
  }

  console.log(`\n${BOLD}Portable reputation (aggregated by agent identity):${OFF}`);
  console.log(formatReputation(tallyReputation(warrants)));
  console.log("");
  console.log(formatByHarness(tallyByHarness(warrants)));
  console.log(`\n${DIM}The reputation is keyed by the agent, not the harness — it travels with OmniRefund everywhere.${OFF}\n`);
}

// Only run the console demo when invoked directly, not when imported by the board.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
