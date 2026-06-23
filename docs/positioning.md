# Warrant — Positioning (technical)

*The narrative for why Warrant exists and why it is defensible. Technical framing
only — no launch/social copy (launch/social copy is handled separately, outside this repo).
Evidence and citations live in [`gap-analysis.md`](./gap-analysis.md).*

---

## One line
**No claim without a warrant.** When one agent hires another, Warrant independently
checks the *world state* to prove the work actually happened, issues a signed
**warrant**, and rolls verified warrants into a **portable, context-conditioned
reputation**. Your agent says it booked the flight — did it? Get the warrant.

## The question nobody else answers
Every inter-agent standard today answers *"is this agent who it claims, and was it
authorized?"* — identity, transport, discovery, payment are all solved and
well-funded. **None answers *"did the agent actually do what it claimed?"***

And the part that makes it a moat: almost everyone who *does* check behavior checks
the **trace** — the agent's self-reported execution log. The trace is exactly what a
silently-failing agent fabricates. Warrant checks the **world-state outcome**: it
queries a source the agent does not control (the airline's reservation system, the
payments ledger, CI) and compares it to the claim.

> **The verdict is derived from world state, never from the self-reported trace.**

That single distinction — world-state outcome vs. self-reported trace — is the entire
defensible surface.

## Why now
- **A2A** (Linux Foundation) owns agent↔agent transport, but task status is
  **self-reported** (`COMPLETED` is set by the remote agent), and its
  **"opaque execution"** principle *structurally forbids* the caller from inspecting
  how the work was done. Introspection is off the table by design → world-state
  outcome verification is the only viable path.
- **MCP** has **no attestation** through its latest release candidate — tool results
  are self-report + JSON-shape validation only.
- The community is explicitly asking: A2A Discussion **#1631** ("Reputation-Aware
  Agent Discovery") proposes exactly this **as an extension** — and it is unmerged,
  not in core.

The window is real but closing (estimated 6–12 months): the *reputation* half is
already being built; the defensible half is the **independent outcome check that
feeds it.**

## The field, and what each leaves open
| Flank | What it owns | What it leaves open (our lane) |
|---|---|---|
| A2A / MCP | Transport + self-reported status; extension mechanism | No outcome verification; opaque execution → outcome-check is the only path |
| ERC-8004 | On-chain identity + reputation registry | **Crypto-native**; reputation is **self-reported** feedback, not outcome-verified |
| Diagrid / Dapr "Verifiable Execution" | Signs the execution **history** | **History integrity** (log untampered) ≠ outcome real; a signed `COMPLETED` from a liar still passes |
| Patronus / Braintrust / Galileo / Arize | Trace/eval **observability** | Grade the trace/output vs expected, not the world-state effect |
| AgentReputation (arXiv 2605.00073) | Outcome-verified, context-conditioned reputation — *closest idea* | **Crypto + staking, software-engineering-only, unimplemented blueprint** |
| MoltBridge | Reputation graph for A2A — *closest product* | Outcomes = **peer attestation + harness pass/fail**, not independent world-state truth |

## What is genuinely novel
**Non-crypto, framework-agnostic, world-state outcome verification + outcome-derived,
context-conditioned, portable reputation — packaged as an A2A extension.** No single
competitor occupies that intersection:
- vs **MCP/A2A** — they're transport + self-report; warrants add the missing outcome truth.
- vs **ERC-8004** — non-crypto + outcome-verified, not on-chain + self-reported.
- vs **Diagrid** — outcome-vs-intent against ground truth, not log-integrity.
- vs **Patronus** — world-state, not trace/expected-output grading.
- vs **AgentReputation / MoltBridge** — non-crypto, general, **shipped and runnable**,
  and *independent ground truth* rather than peer attestation or staked re-execution.

## The proof (shipped, runnable, zero-dep)
1. **Spec v0** — `docs/warrant-spec.md` + `schema/warrant-0.schema.json`:
   `intent → claimed_outcome → verification(method + independent evidence) →
   verdict(warranted | refuted | unverifiable) → signature`. Body = an OpenTrajectory
   record. Non-crypto Ed25519 signature. Packaged as an A2A extension
   (`examples/a2a-extension.json`).
2. **Verifier** — `packages/verify/`: zero-dep TypeScript; world-state probe +
   deterministic verdict engine; the moat is enforced in code (`warranted` requires
   independent + matching evidence; self-report alone → `unverifiable`; a flipped
   verdict stamp is rejected on re-verify). Reuses the shipped OpenTrajectory/Inspector
   judge for fuzzy outcomes rather than rebuilding it.
3. **Live demo** — `packages/demo/` (`npm run demo`): two agents over A2A both return
   `COMPLETED`; an independent PNR probe issues a **green** warrant to the honest agent
   and a **red** one to the liar.
4. **Public reputation board** — `npm run board` → `site/index.html`: a self-contained
   page ranking agents by *warranted* behavior, **context-conditioned** (good-at-refunds
   ≠ good-at-booking).
5. **Portable across harnesses** — `npm run cross-harness`: one agent under two
   harnesses → the same warrant format → one portable reputation keyed by agent
   identity, not harness.

## Defensibility
The whole stack solved identity/transport/discovery/payment and **left
outcome-verification open** — A2A's own community is asking for it. It is contested
from three flanks (crypto ERC-8004, infra Diagrid, eval Patronus) but **no one owns
non-crypto, framework-agnostic, world-state outcome verification + verified
reputation.** Fallback value if "the standard" never lands: *"the tool that catches
agents lying about what they did"* is a shippable product on its own.

## Honest caveats (no overclaiming)
- "Outcome" is now a crowded buzzword. Messaging must aggressively distinguish
  **world-state** from **expected-output grading**, or Warrant gets lumped with the
  eval vendors.
- The window is **inferred** from the absence of a shipped competitor plus the velocity
  of adjacent launches — not guaranteed. **MoltBridge** is the live watch-item.
- Demo data, agents, systems, and signatures in this repo are **illustrative**. The
  verifier and reputation engine are real and tested; the probes against named external
  systems are mocked for the demo.
- v1 deliberately covers one demo path (A2A) and a small set of verifier domains.
  Breadth is future work, not a current claim.

## Status & links
v1 complete + v2 cross-harness. Gap analysis: [`gap-analysis.md`](./gap-analysis.md).
Spec: [`warrant-spec.md`](./warrant-spec.md). Verifier: [`../packages/verify`](../packages/verify).
Demo + board: [`../packages/demo`](../packages/demo).
