# Warrant Specification — v0

**Status:** v0 (draft, hand-authored examples validate). **Date:** 2026-06-22.
**Companion schema:** [`schema/warrant-0.schema.json`](../schema/warrant-0.schema.json) (machine-readable; the normative shape).
**Examples:** [`examples/flight-booking.warrant.json`](../examples/flight-booking.warrant.json) (warranted), [`examples/flight-booking-lied.warrant.json`](../examples/flight-booking-lied.warrant.json) (refuted).

---

## 0. What a warrant is

A **warrant** is a signed attestation that an agent's *claimed outcome* was **independently checked against the world** and found true, false, or uncheckable. It is the answer to one question: **"Your agent says it did X — did it?"**

```
intent  →  claimed_outcome  →  verification (method + INDEPENDENT evidence)  →  verdict  →  signature
```

A warrant is issued by a **verifier** (the party running the check), *about* a **subject** (the agent that did the work), for a **caller** (the party that hired the subject). The subject does not issue its own warrant — self-attestation is exactly what this replaces.

### The one rule (the moat)
> **The verdict is derived from the world state, never from the agent's self-reported trace.**

The agent's self-report (its A2A task status, its returned result, its execution log) is recorded in the warrant as the **claim** — it is the thing being checked, not the evidence. Evidence is an **independent observation of ground truth** (query the airline's PNR, read the row that was supposedly written, re-fetch the page that was supposedly published). A silently-failing agent fakes its trace; it cannot fake the airline's reservation system. Every evidence item carries an explicit `independent: true|false` flag, and **a warrant cannot reach `warranted` on self-reported evidence alone** (§5).

### What a warrant is NOT
- Not a transport, identity, discovery, or payment mechanism — those are owned (A2A, MCP, ERC-8004, AP2). Warrant rides on top.
- Not trace-grading or eval (Patronus/Braintrust lane) — those score the self-reported log against expected output. Warrant checks the world.
- Not crypto/on-chain (ERC-8004 lane) — the signature is a plain detached Ed25519/JWS over a canonical body. No chain, no token, no staking.

---

## 1. Top-level shape

A warrant is a JSON object. Required fields are marked **R**.

| Field | R | Type | Meaning |
|---|---|---|---|
| `warrant_version` | R | string | Spec version. `"0"` for this document. |
| `warrant_id` | R | string | Unique id for this warrant (issuer-scoped, e.g. a UUID). |
| `issued_at` | R | string | RFC 3339 timestamp the verdict was sealed. |
| `issuer` | R | object | Who ran the check and signs the warrant (§2). |
| `subject` | R | object | The agent the warrant is *about* (§2). |
| `caller` |  | object | The party that hired the subject (§2). |
| `task_context` | R | object | Skill/domain tag for context-conditioned reputation (§3). |
| `intent` | R | object | What the caller asked for (§4). |
| `claimed_outcome` | R | object | What the subject reported — the **claim** under test (§4). |
| `verification` | R | object | The independent world-state check (§5) — **the moat**. |
| `verdict` | R | object | `warranted` \| `refuted` \| `unverifiable` + reasoning (§6). |
| `body` |  | object | The full **OpenTrajectory 0.1 record** of the run (§7) — context, not evidence. |
| `nonce` |  | string | Optional anti-replay nonce, unique per `(subject, task)` (§8.1). |
| `signature` |  | object | Detached signature over the canonical warrant (§8). Required for a warrant to count toward reputation. |

A warrant with everything except `signature` is a valid **unsigned warrant** (useful in tests/demos); it does not roll into reputation until signed.

---

## 2. Parties — `issuer`, `subject`, `caller`

All three share one shape:

| Field | R | Type | Meaning |
|---|---|---|---|
| `id` | R | string | Stable identifier. For A2A agents, the Agent Card URL or a DID; for a verifier, a key-scoped id. |
| `name` |  | string | Human-readable label. |
| `key_id` |  | string | Identifier of the public key used to verify this party's signatures (issuer only, required if the warrant is signed). |

`issuer` MUST be distinct from `subject` (no self-warranting). A verifier MAY be the caller, a neutral third party, or a shared service — the spec does not mandate who runs it, only that it is not the subject.

---

## 3. `task_context` — the key to portable reputation

Reputation is **context-conditioned**: good-at-refunds ≠ good-at-code. Every warrant is tagged so reputation can be grouped per skill without conflation.

| Field | R | Type | Meaning |
|---|---|---|---|
| `domain` | R | string | Coarse skill bucket, dotted. e.g. `travel.booking`, `payments.refund`, `code.bugfix`. |
| `capability` |  | string | The specific A2A skill/capability id invoked, if known. |
| `tags` |  | string[] | Free-form refinements. |

Reputation is **always** reported per `domain` (and optionally per `capability`). There is no single global score — that is a deliberate design choice, not an omission.

---

## 4. `intent` and `claimed_outcome`

`intent` — what was asked:

| Field | R | Type | Meaning |
|---|---|---|---|
| `description` | R | string | Natural-language statement of the task. |
| `parameters` |  | object | Structured inputs (e.g. `{from, to, date, passenger}`). |
| `success_criteria` |  | string[] | What "done" means, in checkable terms — the basis for `verification`. |

`claimed_outcome` — what the subject reported (**the claim under test, self-reported**):

| Field | R | Type | Meaning |
|---|---|---|---|
| `status` | R | string | The subject's self-reported status. For A2A, mirror the task state (e.g. `COMPLETED`). |
| `summary` |  | string | The subject's natural-language claim. |
| `asserted_facts` |  | object | Structured facts the subject asserts are now true in the world (e.g. `{pnr: "X7K2QL", seat: "14C"}`). These are precisely what `verification` probes. |
| `source` | R | string | Where the claim came from. MUST be `self-report` (it is the agent's own word). |

---

## 5. `verification` — the independent world-state check (the moat)

| Field | R | Type | Meaning |
|---|---|---|---|
| `method` | R | string | How the check was done (§5.1). |
| `checked_at` | R | string | RFC 3339 timestamp of the probe. |
| `verifier_note` |  | string | Human-readable description of the probe performed. |
| `evidence` | R | array | One or more evidence items (§5.2). Non-empty. |

### 5.1 `method` (enum, extensible)
- `world-state-probe` — query an authoritative external system independent of the subject (the canonical method; the moat).
- `post-condition` — assert a checkable condition on a system the subject claimed to change (TrueCall-style).
- `judge` — the validated Inspector/auditor judge renders a verdict over evidence (reused as-is; see §7). A `judge` method MUST still cite independent evidence — the judge reasons *over* ground truth, it is not itself the ground truth.
- `none` — no independent check was possible (forces `verdict.value = unverifiable`).

### 5.2 Evidence item

| Field | R | Type | Meaning |
|---|---|---|---|
| `source` | R | string | The system observed (e.g. `amadeus-pnr-api`, `postgres:orders`, `https://example.com/post/42`). |
| `independent` | R | boolean | `true` iff this observation comes from a source **the subject does not control and could not fabricate**. |
| `probe` |  | string | The exact query/action run to observe ground truth. |
| `observed` | R | any | What the world actually showed. |
| `expected` |  | any | What `claimed_outcome.asserted_facts` / `success_criteria` predicted. |
| `match` | R | string | `match` \| `mismatch` \| `absent` \| `inconclusive`. |

**Hard rule:** `verdict.value = warranted` REQUIRES at least one evidence item with `independent: true` and `match: match`. Self-reported evidence (`independent: false`) may *enrich* a warrant but can never, on its own, support `warranted`. This is the line that keeps Warrant out of the trace-grading lane.

**Source provenance.** `independent` is a *claim*, and a malicious subject could probe a system it secretly controls and flag it `independent: true`. To ground the claim, `source` MUST be a **stable, recognizable identifier** (host / URL / DID), and a consumer SHOULD verify it against its own set of **recognized authoritative sources** for the domain — counting an evidence item as independent only if its source is recognized. `verifyWarrant(w, { recognizedSource })` and the registry's `recognizedSources` option enforce this: an unrecognized source is treated as non-independent, downgrading toward `unverifiable`. See [`trust-model.md`](./trust-model.md).

---

## 6. `verdict`

| Field | R | Type | Meaning |
|---|---|---|---|
| `value` | R | string | `warranted` \| `refuted` \| `unverifiable`. |
| `confidence` |  | number | 0–1. |
| `reasoning` | R | string | Why, referencing the evidence. |
| `evaluator` |  | string | What produced the verdict (e.g. `warrant/verify 0.1`, or the judge id + model for `method: judge`). |

Verdict semantics:
- **`warranted`** — independent evidence confirms the claim. (Requires §5.2 hard rule.)
- **`refuted`** — independent evidence contradicts the claim (the agent lied or silently failed): `mismatch` or `absent` on the load-bearing fact.
- **`unverifiable`** — no independent probe was possible, or evidence was `inconclusive`. **Absence of evidence is not negative evidence** (per A2A #1631) — `unverifiable` is a first-class outcome, never silently coerced to `refuted`.

---

## 7. `body` — the OpenTrajectory record (context, not evidence)

The warrant body is a full **OpenTrajectory 0.1** record (`schema/opentrajectory-0.1.schema.json` in the OpenTrajectory project) — the captured run of the subject agent: `steps[]`, `outcome`, etc. It is included for auditability and to feed `method: judge`.

Critically: **`body.steps[]` is the self-reported trace.** It is the claim's supporting narrative, **not** the warrant's evidence. The OpenTrajectory `outcome.verdict` (the auditor's HARNESS/TRAINING/PRODUCT/CLEAN diagnosis) is *reused as-is* for trajectory analysis but is **orthogonal** to the warrant verdict: a trajectory can be `CLEAN` (well-behaved run) and still earn a `refuted` warrant if the world never changed. Keep the two verdict vocabularies separate.

---

## 8. `signature` — non-crypto, enterprise-friendly

A detached signature over the **canonical warrant** — the warrant object with the `signature` field removed, serialized canonically (sorted keys, no insignificant whitespace; JCS RFC 8785 recommended).

| Field | R | Type | Meaning |
|---|---|---|---|
| `alg` | R | string | Signature algorithm. Default `Ed25519`. |
| `key_id` | R | string | Identifies `issuer`'s public key (resolvable out of band). |
| `value` | R | string | base64url signature over the canonical warrant. |

No chain, no token, no staking, no on-chain registry — distinct from ERC-8004 by design. Key distribution is left to existing PKI/JWKS/DID infrastructure; Warrant does not invent one.

### 8.1 Anti-replay & freshness

A warrant attests world state **as of `issued_at`**; a stale warrant may no longer hold, and a valid warrant could be resubmitted to inflate reputation. Two opt-in protections, enforced at the consuming end (the registry, or `verifyWarrant`):

- **Freshness window** — reject a warrant whose `issued_at` is older than a configured `maxAgeMs` (or dated in the future beyond clock skew). `verifyWarrant(w, { maxAgeMs })` and the registry `maxAgeMs` option.
- **Replay protection** — a signed warrant's `signature.value`, and/or an explicit `nonce`, may be accepted only **once**. The registry rejects a previously-seen signature or nonce. (A signature also can't be reattached to a modified warrant — changing any field breaks it.)

These let a registry/consumer ensure each verified outcome is counted once and is still current.

---

## 9. Packaging as an A2A extension

Warrant ships as an **A2A extension**, the protocol's sanctioned path for adding capability without forking core.

**Extension URI:** `https://warrant.dev/a2a/ext/outcome-verification/v0` *(illustrative; final host TBD per CLAUDE.md naming).*

**Declaration** — a Warrant-capable agent or verifier advertises it in its Agent Card under `capabilities.extensions`:

```json
{
  "capabilities": {
    "extensions": [
      {
        "uri": "https://warrant.dev/a2a/ext/outcome-verification/v0",
        "description": "Issues/accepts world-state outcome warrants for completed tasks.",
        "required": false,
        "params": { "domains": ["travel.booking", "payments.refund"] }
      }
    ]
  }
}
```

**Carriage** — a warrant is attached to the completed A2A `Task` as an artifact (an `Artifact` whose part is the warrant JSON), or returned in the extension's response data. The warrant references the task it certifies via `intent`/`claimed_outcome`. This is a **Data + Method** extension (it adds data and a "request a warrant for task T" method); it changes no core state machine and is opt-in per request.

A concrete manifest (extension descriptor + an example Agent Card that declares it) is in [`examples/a2a-extension.json`](../examples/a2a-extension.json).

---

## 10. Minimal valid warrant (illustrative)

The canonical "did it book the flight?" case. Full versions (with OpenTrajectory body) are in `examples/`.

```json
{
  "warrant_version": "0",
  "warrant_id": "wrt_2f1a...",
  "issued_at": "2026-06-22T18:30:05Z",
  "issuer": { "id": "verifier://warrant-demo", "name": "Warrant Verifier", "key_id": "demo-ed25519-1" },
  "subject": { "id": "https://agents.example/travel-booker/card.json", "name": "TravelBooker" },
  "caller": { "id": "https://agents.example/concierge/card.json", "name": "Concierge" },
  "task_context": { "domain": "travel.booking", "capability": "book_flight" },
  "intent": {
    "description": "Book one economy seat SFO→JFK on 2026-07-01 for Alex Rivera.",
    "parameters": { "from": "SFO", "to": "JFK", "date": "2026-07-01", "passenger": "Alex Rivera" },
    "success_criteria": ["A confirmed PNR exists in the airline system for this passenger and itinerary."]
  },
  "claimed_outcome": {
    "status": "COMPLETED",
    "summary": "Booked. Confirmation X7K2QL, seat 14C.",
    "asserted_facts": { "pnr": "X7K2QL", "seat": "14C" },
    "source": "self-report"
  },
  "verification": {
    "method": "world-state-probe",
    "checked_at": "2026-06-22T18:30:04Z",
    "verifier_note": "Queried the airline PNR API independently of the subject agent.",
    "evidence": [
      {
        "source": "amadeus-pnr-api",
        "independent": true,
        "probe": "GET /pnr/X7K2QL",
        "observed": { "status": "CONFIRMED", "passenger": "Alex Rivera", "itinerary": "SFO-JFK 2026-07-01", "seat": "14C" },
        "expected": { "pnr": "X7K2QL", "seat": "14C" },
        "match": "match"
      }
    ]
  },
  "verdict": {
    "value": "warranted",
    "confidence": 0.99,
    "reasoning": "Independent airline PNR lookup confirms a CONFIRMED reservation matching the claimed PNR, passenger, itinerary, and seat.",
    "evaluator": "warrant/verify 0.1"
  },
  "signature": { "alg": "Ed25519", "key_id": "demo-ed25519-1", "value": "BASE64URL_ILLUSTRATIVE_NOT_A_REAL_SIGNATURE" }
}
```

---

## 11. Out of scope for v0
Key distribution / PKI, the reputation aggregation algorithm (warrants are the inputs; the board is Phase 3), multi-harness breadth, a hosted verifier service, dispute/arbitration (A2A #1631 layer 2). v0 defines the **attestation**; downstream layers consume it.
