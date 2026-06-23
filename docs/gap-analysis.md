# Warrant — Gap Analysis (Phase 0)

**Date:** 2026-06-22 · **Status:** Phase 0 complete · **Verdict: GO**

## (a) State of the world
The agent-interop stack has solved identity, transport, discovery, and payment — and
left **outcome verification open.** A2A (Linux Foundation, v1.0.1 dated 2026-05-28) owns
agent↔agent transport but task status is **self-reported** (the remote agent sets
`TASK_STATE_COMPLETED` itself), and its **"Opaque Execution"** principle *structurally
forbids* the caller from inspecting how the work was done — so introspection is off the
table by design and **world-state outcome verification is the only viable path.** MCP
(through the 2026-07-28 release candidate) still has **no attestation** — tool results are
self-reported `isError` + JSON-shape `outputSchema` validation only. The community is
explicitly asking for the missing layer: A2A Discussion **#1631 "Reputation-Aware Agent
Discovery"** (opened 2026-03-14, ~31 comments, **OPEN, not in core**, proposed *as an
extension*). Every adjacent effort answers *"is this agent who it claims, and was it
authorized?"* — **none independently answers *"did the agent actually do what it claimed,
in the world?"*** The field clusters into three buckets that each leave the wedge open:
(1) identity/authorization attestation, (2) trace/eval observability, (3) crypto-native
reputation. "Outcome" is now a crowded buzzword that in practice means *expected-output
grading* or *self/peer-reported feedback* — not an independent world-state check. That one
distinction (world-state outcome vs. self-reported trace) is the entire moat.

## (b) Adjacent efforts — what each does NOT cover
| Effort | What it does | What it does NOT cover (our lane) |
|---|---|---|
| **A2A core** (v1.0.1, 2026-05-28) | Transport; Agent Cards; `AgentCardSignature` signs card authenticity; extension mechanism (`AgentCapabilities.extensions`) | No reputation/verification/attestation/outcome **protocol mechanism**. Task status self-reported. Opaque Execution blocks introspection → outcome-check is the only path. |
| **A2A #1631** (discussion) | Community proposal for reputation-aware discovery, as an extension; multi-dim scoring incl. "honesty"; anti-gaming | Unmerged; not in core. Contributor prototypes lean peer-rated / Ed25519-signed self-attestation — still downstream of **self-report**. None does independent world-state verification. |
| **A2A #1677 (OATR), IETF identity drafts, A2A-SE** | Runtime *authorization* attestation (Ed25519/JWT); DID/VC federation | Answer "is this agent authorized?" (L3), not "did it do it?" (L4/L5). Identity/authz, not outcome. |
| **MCP** (incl. 2026-07-28 RC) | Tool calls; `isError` self-report; `outputSchema` JSON Schema 2020-12 validation; W3C Trace Context in `_meta` | **No attestation.** Format validation ≠ truth validation. Trace propagation = observability, not authenticity. |
| **Diagrid / Dapr 1.18 "Verifiable Execution"** (2026-06-11) | Signs workflow **history** (SPIFFE); history propagation/lineage; activity attestation | **History integrity only** — proves the log is *authentic/untampered*, NOT that the outcome is *real*. A signed `COMPLETED` from a silently-failing agent still passes. Leaves outcome-vs-intent untouched. |
| **ERC-8004 "Trustless Agents"** (mainnet 2026-01-29) | On-chain identity (ERC-721) + reputation registry + validation registry | **Crypto-native.** Reputation = **self-reported** `giveFeedback` stored as-is. "Validation" = stake/zkML/TEE re-execution (proves *computation correct*), **not world-state outcome**. EIP itself disclaims it "cannot guarantee advertised capabilities are functional." |
| **Patronus / Braintrust / Galileo / Arize / LangSmith** | Trace/eval observability; Patronus "Exact Match" grades outputs vs expected (e.g. flight prices match a DB) | Grade the **trace/output**, not whether the real-world effect occurred (flight physically booked). No reputation/attestation product. Patronus strategic move is toward AGI/world-models — *away* from this lane. |
| **Nava** ($8.3M seed, 2026-04) | Crypto escrow + **pre-execution** intent-matching (L3 on Arbitrum, on-chain ledger) | Crypto-native; verifies intent *before* execution, not post-hoc world-state outcome. Different lane. |
| **arXiv 2512.17259 "Verifiability-First Agents"** | AI-safety runtime control: signed provenance "receipts" (`result_hash`), intent-conformance audit agents, challenge-response reasoning introspection | **Verifies the trace/log** (the canonical thing a silently-failing agent lies in). "External effects" = the tool's *self-returned* output hash, no independent ground-truth probe. Single-harness, no reputation. (Also: names its artifacts "receipts" — reinforces dropping that name.) |
| **arXiv 2605.00073 "AgentReputation"** | *Vision/blueprint.* Evidence-based (not rating-based) reputation; context-conditioned reputation cards (good-at-X ≠ good-at-Y); portable identity | **Crypto-native** (on-chain commitments + **slashable staked collateral**); **domain-scoped to software-engineering** (verification = run the test suite); **unimplemented** — explicitly defers the verification ontology + strength-quantification (the hard parts). Narrows our claim but leaves **non-crypto / general / shipped** open. |

## (c) Most credible competitors in outcome-verification of agent behavior
1. **MoltBridge (SageMindAI)** — closest. A2A trust/discovery layer with "behavioral
   attestation": signed pass/fail test results → attestation edges, portable JWT
   "credibility packets," domain-scoped trust graphs. **Gap it leaves:** outcomes are
   **harness-test results + peer attestation** (agents attest each other), not
   *independent world-state ground-truth*; Ed25519/DID-flavored. Owns the reputation-graph
   flank; does **not** own the world-state-outcome moat. **Watch closely** — could extend
   toward outcomes.
2. **arXiv 2605.00073 (AgentReputation)** — most rigorous articulation of outcome-verified,
   context-conditioned, portable reputation. **Crypto + framework-agnosticism unsolved +
   unimplemented.** A prior-art citation, not a shipped product.
3. **Nava** — most-funded adjacent "did the agent do the right thing with money," but
   **crypto-escrow + pre-execution** intent-matching. Different lane.

   *Honorable mention:* FullStory cofounder think-piece articulates our exact thesis
   ("traceable to ground-truth evidence… replay and check") but names **no product** —
   third-party validation of the gap, not a competitor.

## (d) Verdict — **GO**
Every vector confirms the moat. Identity/authz saturated (OATR, IETF, #1677); trace/eval
saturated (Patronus et al.); crypto reputation taken (ERC-8004, Nava, AgentReputation).
**Non-crypto + framework-agnostic + independent world-state outcome verification +
outcome-derived portable reputation = unclaimed.** Fallback value holds even if "the
standard" never lands: *"the tool that catches agents lying about what they did"* is a
shippable product on its own.

**Caveats (no overclaiming):**
- "Outcome" is a crowded buzzword — messaging must aggressively distinguish **world-state**
  from **expected-output grading**, or Warrant gets lumped with Patronus.
- Window is real (6–12mo, *inferred* from absence of a shipped competitor + velocity of
  adjacent launches). The reputation half is already being built; the defensible half is the
  **independent outcome check that feeds it.**
- "No competing outcome-verification extension" is a strong inference (spec + #1631 thread +
  registry scan), not an exhaustive crawl.

**Positioning to sharpen (vs. the near-misses):** lead with **non-crypto + world-state +
shipped/runnable**, specifically against AgentReputation (crypto/SE-only/blueprint) and
MoltBridge (peer-attestation/harness-pass-fail, not independent ground truth).

## What Phase 1 (the warrant spec) should cover
1. **Schema as an A2A extension** — declared via `AgentExtension` in `AgentCapabilities`
   (the idiomatic, supported path; `uri` + `description` + `params`).
2. **Warrant shape:** `intent → claimed_outcome → verification (method + evidence) →
   verdict (warranted | refuted | unverifiable) → signature`. Body = an OpenTrajectory record.
3. **The verification block must carry the world-state probe** (the moat): method +
   independent evidence source, explicitly *not* the agent's self-reported trace.
4. **Non-crypto signature** (enterprise-friendly; no chain/token/staking) — plain Ed25519/JWS
   over the warrant body, distinct from ERC-8004's on-chain model.
5. **`unverifiable` as a first-class verdict** — honors #1631's "absence of evidence ≠
   negative evidence."
6. **Hooks for context-conditioned reputation** — verdicts must be groupable by task context
   (good-at-refunds ≠ good-at-code) without yet building the board.
7. Hand-author **one valid warrant** as the acceptance test.

## Primary sources
- arXiv 2512.17259 · arXiv 2605.00073
- github.com/a2aproject/A2A/discussions/1631 · /1677 · a2a-protocol.org/dev/specification/ · /dev/topics/extensions/
- blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
- Diagrid/Dapr 1.18 (BusinessWire 2026-06-11) · eips.ethereum.org/EIPS/eip-8004
- patronus.ai/ai-agent-development · github.com/SageMindAI/moltbridge · Nava (Fortune 2026-04-14)
