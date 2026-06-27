# Warrant — Reputation integrity (anti-gaming)

A reputation system is only useful if it's hard to game. Outcome-verification helps
— you can't fake a *warranted* without independent ground truth — but the
*aggregation* still needs to resist farming and sybils. This is the threat model and
what Warrant does about it.

## Threats & mitigations

| Threat | What it looks like | Mitigation | Status |
|---|---|---|---|
| **Easy-task farming** | Rack up 1,000 trivial *warranted* tasks to look elite | **Difficulty weighting** — `task_context.weight` (default 1) discounts low-value tasks; `tallyReputation(w, { weightOf })` scores on weighted sums | ✅ opt-in |
| **Volume illusion** | A 3/3 record looks as good as 300/300 | **Confidence** — every `AgentRep` carries a Wilson lower-bound (`confidence`): the *rate* can be 100% but the *confidence* stays low until there's enough evidence. Rank/threshold on confidence, not raw rate | ✅ always computed |
| **Stale glory** | Coast on old wins after quality drops | **Recency decay** — `tallyReputation(w, { halfLifeMs })` decays older warrants toward 0 | ✅ opt-in |
| **Self/colluding verifier** | A friendly verifier rubber-stamps | **Source provenance** (recognized sources) + **N-of-M independent verification** (`consensusVerdict`) + **verifier reputation** (`verifierStandings`) — a verifier outvoted by independent peers loses standing | ✅ (see trust-model.md) |
| **Sybil agents** | Spin up fresh identities to escape a bad record, or to fake reviews | Reputation is keyed by a **stable, costly identity** (Agent Card URL / DID). Warrant does not mint identity — it leans on the identity layer (A2A cards, DIDs, ERC-8004) where creating a *credible* identity has cost. Unrecognized/throwaway issuers and sources are discounted | ⚠️ relies on the identity layer |
| **Refuted-warrant suppression** | Hide your red warrants, show only green | Warrants are **portable and signed** — a consumer aggregates all warrants it can see, not a curated subset; the board counts `refuted` and `unverifiable`, not just `warranted` | ✅ by design |

## The honest limits
- **Sybil resistance is not Warrant's to solve.** Outcome-verification stops you from
  *faking* a result, but a determined actor can still abandon a tarnished identity and
  start fresh — unless creating a credible identity is costly. That cost lives in the
  identity layer (DIDs, domain-bound cards, on-chain identity), which Warrant rides on
  rather than reinvents. Warrant's contribution is making each identity's record
  *truthful and portable*, so a fresh identity starts with **no** reputation (not a
  clean slate of fake positives).
- **Weighting needs a difficulty signal.** `task_context.weight` only helps if someone
  sets it honestly; in adversarial settings the weight itself should come from the
  caller or a neutral party, not the subject.

## One line
**You can't fake a warranted outcome (it needs independent ground truth); the
aggregation resists *farming* via difficulty-weighting, recency decay, and
confidence bounds; and it resists *collusion* via recognized sources, N-of-M, and
verifier reputation. Sybil resistance is delegated to the identity layer — Warrant's
job is to make each identity's record true and portable.**

See [`trust-model.md`](./trust-model.md) for the verifier-trust side.
