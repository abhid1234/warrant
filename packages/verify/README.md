# @avee1234/warrant-verify

Zero-dependency Warrant verifier (spec v0). Runs the **world-state outcome check**
against ground truth and renders a verdict: `warranted` | `refuted` | `unverifiable`.

**The moat:** the verdict is computed only from independent observations of the
world (`verification.evidence`), never from the agent's self-reported trace
(`warrant.body`). Self-reported evidence (`independent: false`) can enrich a
warrant but can never, on its own, support `warranted`.

## Build & test
```bash
npm run build   # tsc -> dist/  (no external deps; Node built-ins only)
npm test        # builds, then runs the zero-dep harness in test/run.ts
```
Requires Node ≥18 and a local `tsc`. No npm install needed at runtime.

## CLI
```bash
node dist/src/cli.js verify   ../../examples/flight-booking.warrant.json  # schema + re-derive verdict
node dist/src/cli.js validate ../../examples/flight-booking.warrant.json  # JSON-schema conformance only
node dist/src/cli.js rep      ../../examples/                             # context-conditioned reputation
node dist/src/cli.js rep --by-harness ../../site/data/warrants.json       # + portable cross-harness breakdown
```
- `verify` re-derives the verdict from the warrant's own evidence and schema-validates
  it — it never trusts the stamped verdict (a flipped stamp is rejected).
- `validate` checks structure against `schema/warrant-0.schema.json` (the schema file is
  the source of truth, via a tiny zero-dep subset validator in `schema-validate.ts`).
- `rep` aggregates a file or directory of warrants into per-domain, per-agent scores
  (the same `tallyReputation` the reputation board uses). Reputation is keyed by agent
  identity, so it is **portable across harnesses**; `--by-harness` adds the breakdown.

## API
```ts
import { issueWarrant, verifyWarrant, signWarrant, verifySignature, generateKeypair } from "@avee1234/warrant-verify";
import type { Probe } from "@avee1234/warrant-verify";

// 1. Define a probe that observes GROUND TRUTH, independent of the subject.
const airline: Probe = {
  source: "amadeus-pnr-api",
  independent: true,
  run: async () => ({ observed: await fetch(`/pnr/${pnr}`).then(r => r.json()), probe: `GET /pnr/${pnr}` }),
};

// 2. Issue a warrant: probe the world, compare to the claim, compute the verdict.
const warrant = await issueWarrant({ /* issuer, subject, intent, claimed_outcome, ... */ }, [airline]);

// 3. (optional) Non-crypto signature — Ed25519 over the canonical body. No chain.
const { publicKey, privateKey } = generateKeypair();
const signed = signWarrant(warrant, privateKey, "k1");
verifySignature(signed, publicKey); // true

// 4. Anyone receiving a warrant re-derives the verdict before trusting it.
const { ok, derivedVerdict } = verifyWarrant(signed);
```

## What's reused vs. new
- **New (the wedge):** the world-state probe + comparison (`probe.ts`) and the
  deterministic verdict engine (`verdict.ts`).
- **Reused, not rebuilt:** for fuzzy outcomes (`method: "judge"`), `judge.ts`
  exposes a pluggable seam for the shipped OpenTrajectory / Inspector judge — it
  is not re-implemented here.

See [`../../docs/warrant-spec.md`](../../docs/warrant-spec.md) for the normative spec.
