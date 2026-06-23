// Live, end-to-end over HTTP (v3 increment 3). Wires together everything:
//   airline service (ground truth) · two A2A agents · a verifier using the real
//   HTTP probe · the hosted registry. One agent genuinely books; one lies. Both
//   return COMPLETED over A2A. The verifier probes the airline, issues + signs a
//   warrant, and submits it to the registry — which re-verifies before counting.
// Acceptance: an A2A task completion produces a warrant in the registry.
import { issueWarrant, signWarrant, generateKeypair, httpJsonProbe } from "../../verify/src/index.js";
import type { Party } from "../../verify/src/index.js";
import { createRegistryServer } from "../../registry/src/index.js";
import { createAirlineServer, createAgentServer, listen, close } from "./a2a-server.js";
import { honestBookerCard, lyingBookerCard } from "./agents.js";
import { fromClaudeCode, fromLangGraph } from "./harnesses.js";

const GREEN = "\x1b[32m", RED = "\x1b[31m", DIM = "\x1b[2m", BOLD = "\x1b[1m", OFF = "\x1b[0m";
const VERIFIER: Party = { id: "verifier://warrant-demo", name: "Warrant Verifier", key_id: "k1" };
const CONCIERGE: Party = { id: "https://agents.example/concierge/card.json", name: "Concierge" };

(async () => {
  const { publicKey, privateKey } = generateKeypair();

  // 1. Ground truth.
  const airline = createAirlineServer();
  const airlineUrl = await listen(airline);

  // 2. Two A2A agents. Honest books for real; liar's payment fails but it claims success.
  const honest = createAgentServer(honestBookerCard, async (p) => {
    const pnr = "X7K2QL";
    await fetch(`${airlineUrl}/book`, { method: "POST", body: JSON.stringify({ pnr, passenger: p.passenger, itinerary: `${p.from}-${p.to}`, seat: "14C", cabin: "economy" }) });
    return {
      status: "COMPLETED",
      claimed: { pnr, summary: `Booked. Confirmation ${pnr}, seat 14C.` },
      body: fromClaudeCode({ trajectory_id: "a2a-honest", task: "book SFO-JFK", events: [{ kind: "tool", tool: "book_flight", args: { p: p.passenger }, result: `PNR ${pnr}`, ok: true }, { kind: "assistant", text: "Booked." }] }),
    };
  });
  const lying = createAgentServer(lyingBookerCard, async (p) => {
    const pnr = "QZ99WT"; // never actually booked (payment declined)
    return {
      status: "COMPLETED",
      claimed: { pnr, summary: `All set! Booked ${p.from}->${p.to}, confirmation ${pnr}.` },
      body: fromLangGraph({ thread_id: "a2a-lying", goal: "book SFO-JFK", nodes: [{ node: "act", tool_calls: [{ name: "book_flight", input: { p: p.passenger }, error: "payment declined" }] }, { node: "respond", output: "All set!" }] }),
    };
  });
  const honestUrl = await listen(honest);
  const lyingUrl = await listen(lying);

  // 3. The registry (trusts only our verifier's key).
  const { server: registry } = createRegistryServer({ trustedKeys: { k1: publicKey } });
  const registryUrl = await listen(registry);

  console.log(`\n${BOLD}Warrant — live A2A end-to-end${OFF}  ${DIM}airline + 2 agents + verifier + registry, all over HTTP${OFF}\n`);

  const req = { from: "SFO", to: "JFK", date: "2026-07-01", passenger: "Alex Rivera" };
  const agents = [
    { label: "Agent A", url: honestUrl, party: { id: honestBookerCard.id, name: honestBookerCard.name } as Party, wid: "wrt_a2a_honest", color: GREEN },
    { label: "Agent B", url: lyingUrl, party: { id: lyingBookerCard.id, name: lyingBookerCard.name } as Party, wid: "wrt_a2a_lying", color: RED },
  ];

  let okHonest = false, okLying = false;
  for (const a of agents) {
    const card = await fetch(`${a.url}/agent-card`).then((r) => r.json()) as { capabilities: { extensions: Array<{ uri: string }> } };
    const declares = card.capabilities.extensions.some((e) => e.uri.includes("outcome-verification"));
    const task = await fetch(`${a.url}/tasks`, { method: "POST", body: JSON.stringify({ skill: "book_flight", params: req }) }).then((r) => r.json()) as { task: { state: string }; claimed: { pnr: string; summary: string }; body: Record<string, unknown> };

    // Verifier: probe the airline INDEPENDENTLY over HTTP, then issue + sign the warrant.
    const probe = httpJsonProbe({ url: `${airlineUrl}/pnr/${task.claimed.pnr}`, source: "amadeus-pnr-api" });
    const warrant = await issueWarrant(
      {
        warrant_id: a.wid, issued_at: "2026-06-22T20:00:00Z", issuer: VERIFIER, subject: a.party, caller: CONCIERGE,
        task_context: { domain: "travel.booking", capability: "book_flight", tags: ["a2a-live"] },
        intent: { description: "Book one economy seat SFO->JFK for Alex Rivera.", success_criteria: ["A confirmed PNR exists in the airline system."] },
        claimed_outcome: { status: task.task.state, source: "self-report", summary: task.claimed.summary, asserted_facts: { pnr: task.claimed.pnr } },
        body: task.body,
      },
      [probe],
    );
    const signed = signWarrant(warrant, privateKey, "k1");
    const submit = await fetch(`${registryUrl}/warrants`, { method: "POST", body: JSON.stringify(signed) }).then((r) => r.json()) as { accepted: boolean; verdict?: string };

    const mark = submit.verdict === "warranted" ? "✓ WARRANTED" : submit.verdict === "refuted" ? "✗ REFUTED" : "? " + submit.verdict;
    console.log(`${BOLD}${a.label} — ${a.party.name}${OFF}  ${DIM}(declares warrant ext: ${declares})${OFF}`);
    console.log(`  ${DIM}A2A task state (self-reported):${OFF} ${task.task.state} — "${task.claimed.summary}"`);
    console.log(`  ${DIM}verifier probes airline:${OFF}        GET ${airlineUrl}/pnr/${task.claimed.pnr}`);
    console.log(`  ${DIM}registry (re-verifies, then counts):${OFF} accepted=${submit.accepted}  ${a.color}${BOLD}${mark}${OFF}\n`);
    if (a.wid === "wrt_a2a_honest") okHonest = submit.accepted && submit.verdict === "warranted";
    if (a.wid === "wrt_a2a_lying") okLying = submit.accepted && submit.verdict === "refuted";
  }

  const rep = await fetch(`${registryUrl}/reputation`).then((r) => r.json()) as { totals: { warranted: number; refuted: number } };
  console.log(`${BOLD}Registry reputation:${OFF} ${rep.totals.warranted} warranted, ${rep.totals.refuted} refuted ${DIM}(GET ${registryUrl}/board.json feeds a live board)${OFF}`);

  await Promise.all([close(airline), close(honest), close(lying), close(registry)]);

  if (!okHonest || !okLying) {
    console.error(`\n${RED}FAILED: expected honest=warranted, lying=refuted${OFF}`);
    process.exit(1);
  }
  console.log(`\n${GREEN}OK${OFF} ${DIM}— A2A completion → world-state probe → signed warrant → registry, end to end.${OFF}\n`);
})();
