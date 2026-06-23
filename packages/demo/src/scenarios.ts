// The warrant dataset that feeds the board. It includes the LIVE two-agent
// flight demo (built by actually running the agents against the world) plus a
// deterministic set of seeded warrants across other domains — enough to make the
// rankings meaningful and to show context-conditioning: an agent can be refuted
// at one skill and warranted at another (good-at-refunds != good-at-booking).
//
// Every warrant here is produced by the real verifier (issueWarrant) against an
// independent probe — the board never hand-stamps a verdict.

import { issueWarrant } from "../../verify/src/index.js";
import type { Party, Probe, Warrant } from "../../verify/src/index.js";
import { AirlineWorld } from "./world.js";
import {
  honestBooker,
  lyingBooker,
  honestBookerCard,
  lyingBookerCard,
  type A2ATaskResult,
  type BookingRequest,
} from "./agents.js";
import { crossHarnessWarrants } from "./cross-harness.js";

const VERIFIER: Party = { id: "verifier://warrant-demo", name: "Warrant Verifier", key_id: "demo-ed25519-1" };
const CONCIERGE: Party = { id: "https://agents.example/concierge/card.json", name: "Concierge" };

const TravelBooker: Party = { id: honestBookerCard.id, name: honestBookerCard.name };
const CheapBooker: Party = { id: lyingBookerCard.id, name: lyingBookerCard.name };
const RefundBot: Party = { id: "https://agents.example/refund-bot/card.json", name: "RefundBot" };
const PatchPilot: Party = { id: "https://agents.example/patch-pilot/card.json", name: "PatchPilot" };
const FixItAgent: Party = { id: "https://agents.example/fixit/card.json", name: "FixItAgent" };

// An independent probe of the airline system for a specific claimed PNR.
function airlineProbe(world: AirlineWorld, pnr: string): Probe {
  return {
    source: "amadeus-pnr-api",
    independent: true,
    run: async () => ({ observed: world.lookup(pnr) ?? { status: "NOT_FOUND" }, probe: `GET /pnr/${pnr}` }),
  };
}

export interface FlightDemo {
  request: BookingRequest;
  honest: { result: A2ATaskResult; warrant: Warrant };
  lying: { result: A2ATaskResult; warrant: Warrant };
}

/** Run both agents against one shared world and issue a warrant for each. */
export async function runFlightDemo(): Promise<FlightDemo> {
  const world = new AirlineWorld();
  const request: BookingRequest = { from: "SFO", to: "JFK", date: "2026-07-01", passenger: "Alex Rivera", cabin: "economy" };
  const criteria = ["A confirmed PNR exists in the airline system for this passenger and itinerary.", "The cabin is economy."];

  const honestResult = honestBooker(request, world);
  const honestWarrant = await issueWarrant(
    {
      warrant_id: "wrt_demo_travelbooker",
      issued_at: "2026-06-22T18:30:05Z",
      issuer: VERIFIER,
      subject: TravelBooker,
      caller: CONCIERGE,
      task_context: { domain: "travel.booking", capability: "book_flight", tags: ["live-demo"] },
      intent: { description: "Book one economy seat SFO->JFK on 2026-07-01 for Alex Rivera.", success_criteria: criteria },
      claimed_outcome: honestResult.claimed,
      body: honestResult.body,
    },
    [airlineProbe(world, String(honestResult.claimed.asserted_facts?.pnr))],
  );

  const lyingResult = lyingBooker(request, world);
  const lyingWarrant = await issueWarrant(
    {
      warrant_id: "wrt_demo_cheapbooker",
      issued_at: "2026-06-22T18:31:12Z",
      issuer: VERIFIER,
      subject: CheapBooker,
      caller: CONCIERGE,
      task_context: { domain: "travel.booking", capability: "book_flight", tags: ["live-demo"] },
      intent: { description: "Book one economy seat SFO->JFK on 2026-07-01 for Alex Rivera.", success_criteria: criteria },
      claimed_outcome: lyingResult.claimed,
      body: lyingResult.body,
    },
    [airlineProbe(world, String(lyingResult.claimed.asserted_facts?.pnr))],
  );

  return {
    request,
    honest: { result: honestResult, warrant: honestWarrant },
    lying: { result: lyingResult, warrant: lyingWarrant },
  };
}

// ---- seeded warrants for the rest of the board -----------------------------
interface Seed {
  id: string;
  ts: string;
  agent: Party;
  domain: string;
  capability: string;
  desc: string;
  summary: string;
  asserted: Record<string, unknown>;
  truth: Record<string, unknown> | "ABSENT";
  source: string;
  probe: string;
  independent?: boolean;
}

function issueSeed(s: Seed): Promise<Warrant> {
  const probe: Probe = {
    source: s.source,
    independent: s.independent ?? true,
    run: async () => ({ observed: s.truth === "ABSENT" ? { status: "NOT_FOUND" } : s.truth, probe: s.probe }),
  };
  return issueWarrant(
    {
      warrant_id: s.id,
      issued_at: s.ts,
      issuer: VERIFIER,
      subject: s.agent,
      caller: CONCIERGE,
      task_context: { domain: s.domain, capability: s.capability },
      intent: { description: s.desc },
      claimed_outcome: { status: "COMPLETED", source: "self-report", summary: s.summary, asserted_facts: s.asserted },
    },
    [probe],
  );
}

const SEEDS: Seed[] = [
  // travel.booking — TravelBooker delivers, CheapBooker keeps lying.
  { id: "s_tb1", ts: "2026-06-20T09:00:00Z", agent: TravelBooker, domain: "travel.booking", capability: "book_flight", desc: "Book LAX->ORD", summary: "Booked, PNR BR8801.", asserted: { pnr: "BR8801" }, truth: { pnr: "BR8801", status: "CONFIRMED" }, source: "amadeus-pnr-api", probe: "GET /pnr/BR8801" },
  { id: "s_tb2", ts: "2026-06-21T10:00:00Z", agent: TravelBooker, domain: "travel.booking", capability: "book_flight", desc: "Book SEA->DEN", summary: "Booked, PNR BR8802.", asserted: { pnr: "BR8802" }, truth: { pnr: "BR8802", status: "CONFIRMED" }, source: "amadeus-pnr-api", probe: "GET /pnr/BR8802" },
  { id: "s_cb1", ts: "2026-06-21T12:00:00Z", agent: CheapBooker, domain: "travel.booking", capability: "book_flight", desc: "Book BOS->MIA", summary: "Booked, PNR ZZ0000.", asserted: { pnr: "ZZ0000" }, truth: "ABSENT", source: "amadeus-pnr-api", probe: "GET /pnr/ZZ0000" },

  // payments.refund — RefundBot solid; CheapBooker is actually GOOD here.
  { id: "s_rb1", ts: "2026-06-19T09:00:00Z", agent: RefundBot, domain: "payments.refund", capability: "issue_refund", desc: "Refund order #5510 ($50)", summary: "Refunded $50.", asserted: { refund_id: "RF100", amount: 50 }, truth: { refund_id: "RF100", amount: 50, status: "SETTLED" }, source: "stripe-refunds-api", probe: "GET /refunds/RF100" },
  { id: "s_rb2", ts: "2026-06-19T11:00:00Z", agent: RefundBot, domain: "payments.refund", capability: "issue_refund", desc: "Refund order #5511 ($120)", summary: "Refunded $120.", asserted: { refund_id: "RF101", amount: 120 }, truth: { refund_id: "RF101", amount: 120, status: "SETTLED" }, source: "stripe-refunds-api", probe: "GET /refunds/RF101" },
  { id: "s_rb3", ts: "2026-06-20T08:00:00Z", agent: RefundBot, domain: "payments.refund", capability: "issue_refund", desc: "Refund order #5512 ($30)", summary: "Refunded $30.", asserted: { refund_id: "RF102", amount: 30 }, truth: { refund_id: "RF102", amount: 30, status: "SETTLED" }, source: "stripe-refunds-api", probe: "GET /refunds/RF102" },
  { id: "s_rb4", ts: "2026-06-20T08:30:00Z", agent: RefundBot, domain: "payments.refund", capability: "issue_refund", desc: "Refund order #5513 ($75)", summary: "Refunded $75.", asserted: { refund_id: "RF103", amount: 75 }, truth: { status: "unreachable" }, source: "stripe-refunds-api (timeout)", probe: "GET /refunds/RF103", independent: false },
  { id: "s_cb2", ts: "2026-06-20T13:00:00Z", agent: CheapBooker, domain: "payments.refund", capability: "issue_refund", desc: "Refund order #5520 ($40)", summary: "Refunded $40.", asserted: { refund_id: "RF200", amount: 40 }, truth: { refund_id: "RF200", amount: 40, status: "SETTLED" }, source: "stripe-refunds-api", probe: "GET /refunds/RF200" },
  { id: "s_cb3", ts: "2026-06-21T13:00:00Z", agent: CheapBooker, domain: "payments.refund", capability: "issue_refund", desc: "Refund order #5521 ($60)", summary: "Refunded $60.", asserted: { refund_id: "RF201", amount: 60 }, truth: { refund_id: "RF201", amount: 60, status: "SETTLED" }, source: "stripe-refunds-api", probe: "GET /refunds/RF201" },

  // code.bugfix — verified by re-running CI, not by reading the agent's claim.
  { id: "s_pp1", ts: "2026-06-18T09:00:00Z", agent: PatchPilot, domain: "code.bugfix", capability: "fix_bug", desc: "Fix flaky auth test (PR #412)", summary: "Tests green on #412.", asserted: { pr: "#412", tests_pass: true }, truth: { pr: "#412", tests_pass: true, ci: "green" }, source: "ci-system", probe: "GET /ci/pr/412" },
  { id: "s_pp2", ts: "2026-06-19T09:00:00Z", agent: PatchPilot, domain: "code.bugfix", capability: "fix_bug", desc: "Fix null deref (PR #418)", summary: "Tests green on #418.", asserted: { pr: "#418", tests_pass: true }, truth: { pr: "#418", tests_pass: true, ci: "green" }, source: "ci-system", probe: "GET /ci/pr/418" },
  { id: "s_pp3", ts: "2026-06-20T09:00:00Z", agent: PatchPilot, domain: "code.bugfix", capability: "fix_bug", desc: "Fix race condition (PR #421)", summary: "Tests green on #421.", asserted: { pr: "#421", tests_pass: true }, truth: { pr: "#421", tests_pass: false, ci: "red" }, source: "ci-system", probe: "GET /ci/pr/421" },
  { id: "s_fx1", ts: "2026-06-18T14:00:00Z", agent: FixItAgent, domain: "code.bugfix", capability: "fix_bug", desc: "Fix import cycle (PR #501)", summary: "Tests green on #501.", asserted: { pr: "#501", tests_pass: true }, truth: { pr: "#501", tests_pass: true, ci: "green" }, source: "ci-system", probe: "GET /ci/pr/501" },
  { id: "s_fx2", ts: "2026-06-19T14:00:00Z", agent: FixItAgent, domain: "code.bugfix", capability: "fix_bug", desc: "Fix off-by-one (PR #502)", summary: "Tests green on #502.", asserted: { pr: "#502", tests_pass: true }, truth: { pr: "#502", tests_pass: false, ci: "red" }, source: "ci-system", probe: "GET /ci/pr/502" },
  { id: "s_fx3", ts: "2026-06-20T14:00:00Z", agent: FixItAgent, domain: "code.bugfix", capability: "fix_bug", desc: "Fix memory leak (PR #503)", summary: "Tests green on #503.", asserted: { pr: "#503", tests_pass: true }, truth: { pr: "#503", tests_pass: false, ci: "red" }, source: "ci-system", probe: "GET /ci/pr/503" },
];

/** Every warrant the board displays: live flight pair + seeded set + cross-harness pair. */
export async function allWarrants(): Promise<Warrant[]> {
  const flight = await runFlightDemo();
  const seeded = await Promise.all(SEEDS.map(issueSeed));
  const crossHarness = await crossHarnessWarrants();
  return [flight.honest.warrant, flight.lying.warrant, ...seeded, ...crossHarness];
}
