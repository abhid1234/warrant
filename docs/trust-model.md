# Warrant — Trust model

The hardest question about Warrant: **a warrant is only as trustworthy as the
verifier that issued it. So who runs the verifier, and why should anyone trust its
warrant?** ERC-8004 answers this with crypto-economic staking (lying costs you
money). Warrant is deliberately non-crypto, so it owes a different answer. This is it.

---

## The core move: re-check, don't trust

A warrant is **not** "trust me, I verified it." It is "**here is the probe I ran and
what I observed — check it yourself.**" Every warrant carries its `verification` block:
the `method`, the exact `probe` (e.g. `GET https://api.github.com/repos/o/r/issues/1`),
the `observed` value, and the `match`. Two consequences:

1. **The verdict is re-derived, not believed.** `verifyWarrant()` recomputes the
   verdict from the evidence and rejects a warrant whose stamped verdict doesn't follow
   from its own evidence. A verifier cannot simply *write* `warranted`; the evidence has
   to support it. (Enforced in code today.)
2. **The evidence is re-executable.** For persistent world state, anyone can re-run the
   probe and compare. A lying verifier would have to record a *false observation* —
   and that is caught the moment someone else runs the same probe.

So for the common case, **you don't need to trust the verifier's honesty; you need to
be able to re-execute its evidence.** That removes most of the trust requirement and is
the primitive everything else builds on.

## When re-execution is enough — and when it isn't

| Outcome type | Example | Re-checkable? | Trust needed |
|---|---|---|---|
| **Persistent** world state | booking exists, refund settled, issue open, row written, deploy live | Yes — re-run the probe anytime | ~none; evidence is self-proving |
| **Slow-changing** | CI status, account balance | Yes, within a window | low; freshness matters |
| **Ephemeral / one-shot** | a transient state, a since-deleted side effect | No — gone by the time you re-check | the verifier's attestation at time *T* |

The honest boundary: **re-execution covers the large, valuable class of persistent
outcomes** (commerce, infra, content, code). Ephemeral outcomes fall back to trusting
the verifier — which is where the next two layers come in.

## Three layers of trust

1. **Re-executable evidence (primary).** Don't trust, re-check. Handles persistent
   outcomes with near-zero trust. *Already in v0.*
2. **Verifier identity + reputation.** Verifiers are themselves identified parties
   (`issuer.id`, `key_id`). When evidence can't be re-run, the issuer's track record is
   the signal. Crucially, this reputation is *grounded*: a verifier outvoted by an
   independent peer consensus loses standing — anchored by the cases that *can* be
   checked. *(`verifierStandings()` — implemented.)*
3. **N-of-M independent verification.** For high-stakes outcomes, require warrants from
   ≥2 *independent* verifiers and trust the consensus; disagreement → `disputed`. This
   is the non-crypto analog of staking: **redundancy instead of collateral.**
   *(`consensusVerdict()` — implemented.)*

## Who actually runs the verifier — three patterns

| Pattern | Who | Trust profile |
|---|---|---|
| **Caller-run** | The agent doing the hiring verifies the work it paid for | Skin in the game (it *wanted* the task done). Strong for the caller's own decisions; weaker as a public claim, since it's self-interested. |
| **Third-party / marketplace** | A neutral verification service — e.g. an A2A registry operator, a marketplace, an auditor | Centralized trust, but the operator's reputation is on the line and its evidence is re-runnable. The "CA of warrants." |
| **Federated / peer** | Many independent verifiers; consumers choose whom they trust | Like TLS CAs: no single root. Best for high-stakes + N-of-M. |

The spec does not mandate one — it mandates only that **issuer ≠ subject** and that the
evidence be carried so any of these can be audited. Different ecosystems pick different
points on the centralization spectrum.

## Honest comparison to the crypto answer

ERC-8004 makes lying **expensive** (slash the stake). Warrant makes lying **detectable**
(re-runnable evidence) and **reputationally costly** (verifiers have identity + a track
record). For *adversarial, non-reproducible* outcomes, economic finality is genuinely
stronger — that's the real tradeoff, stated plainly. For the *persistent, re-checkable*
world-state outcomes that dominate real agent work, detectability is sufficient and far
cheaper and more enterprise-palatable than putting money on-chain.

## Threat model

| Threat | Mitigation | Status |
|---|---|---|
| Verifier stamps a verdict its evidence doesn't support | `verifyWarrant()` re-derives from evidence; mismatch rejected | ✅ v0 |
| Verifier fabricates the *observation* | Re-run the probe (persistent state); else N-of-M consensus + verifier reputation | ✅ re-run + `consensusVerdict` |
| Verifier colludes with the subject | Collusion only survives on non-re-runnable evidence *and* a single verifier; independent N-of-M breaks it, and `verifierStandings` docks the colluder | ✅ `consensusVerdict` / `verifierStandings` |
| Subject controls the "independent" source (probes its own API and flags it `independent`) | Consumer grounds the flag against **recognized sources** — `verifyWarrant(w, { recognizedSource })` / registry `recognizedSources`; an unrecognized source is treated as non-independent | ✅ opt-in |
| **Replay** — resubmit an old valid warrant as if fresh | **Freshness window** (`maxAgeMs`) rejects stale/future warrants; the registry rejects a previously-seen `signature` or `nonce` | ✅ opt-in |
| **Sybil verifiers** — spin up many fake verifiers to fake N-of-M consensus | Verifier identity must be costly/established (DID, domain-bound); weight by *recognized* verifiers, not raw count. Identity cost is delegated to the identity layer — see [`reputation-integrity.md`](./reputation-integrity.md) | ⚠️ relies on identity layer |
| Key compromise / rotation | Out of scope for v0; relies on existing PKI/JWKS/DID rotation | ⚠️ deferred |

## What's enforced today vs. next

- **Today (v0):** issuer ≠ subject; verdict re-derived from evidence (no trusting the
  stamp); evidence carries the re-executable probe; `independent` flag; non-crypto
  signature; `unverifiable` as a first-class verdict. **Opt-in:** source-provenance
  grounding (`recognizedSource`), freshness window (`maxAgeMs`), and replay protection
  (signature/`nonce` dedup) — see spec §5.2 and §8.1.
- **Also implemented (library primitives):** N-of-M consensus (`consensusVerdict`) and
  verifier reputation (`verifierStandings`); reputation-gaming defenses (difficulty
  weighting, recency decay, Wilson confidence) — see [`reputation-integrity.md`](./reputation-integrity.md).
- **Next:** surface verifier reputation + consensus in the hosted board UI; a neutral
  difficulty signal for `task_context.weight`; sybil-cost via the identity layer.

## One-line summary
**You don't have to trust the verifier — you have to be able to re-run its evidence.**
Where you can (persistent world state), trust is near-zero. Where you can't (ephemeral
outcomes), verifier reputation and N-of-M independence carry the load — redundancy and
detectability in place of crypto-economic stake.
