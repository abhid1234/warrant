# Quickstart

Warrant verifies whether an agent *actually did what it claimed* — against the world,
not its self-reported log — and rolls verified results into portable, context-conditioned
reputation. Everything is zero-dependency TypeScript (Node built-ins only).

## Install
```bash
# once published:
npm i @avee1234/warrant-verify
npx warrant verify ./my.warrant.json

# from source today:
cd packages/verify && npm run build
node dist/src/cli.js verify ../../examples/flight-booking.warrant.json
```

## CLI
```bash
warrant verify   <file>                 # schema-validate + re-derive the verdict from evidence
warrant validate <file>                 # JSON-schema conformance only
warrant rep [--by-harness] <file|dir>   # context-conditioned (and cross-harness) reputation
```

## Issue + verify a warrant programmatically
```ts
import { issueWarrant, verifyWarrant, signWarrant, generateKeypair, httpJsonProbe } from "@avee1234/warrant-verify";

// 1. A probe observes GROUND TRUTH from a system the agent does not control.
const probe = httpJsonProbe({ url: `https://airline.example/pnr/${pnr}`, source: "amadeus-pnr-api" });

// 2. Issue: probe the world, compare to the claim, compute the verdict.
const warrant = await issueWarrant({
  warrant_id: "wrt_1", issued_at: new Date().toISOString(),
  issuer:  { id: "verifier://me", name: "Verifier", key_id: "k1" },
  subject: { id: "https://agents.example/booker", name: "Booker" },
  task_context: { domain: "travel.booking", capability: "book_flight" },
  intent: { description: "Book SFO->JFK for Alex Rivera." },
  claimed_outcome: { status: "COMPLETED", source: "self-report", asserted_facts: { pnr } },
}, [probe]);

// 3. Sign (non-crypto Ed25519) and let anyone re-verify — they never trust the stamp.
const { publicKey, privateKey } = generateKeypair();
const signed = signWarrant(warrant, privateKey, "k1");
const { ok, derivedVerdict } = verifyWarrant(signed);   // re-derives from evidence
```

The moat in one rule: `warranted` requires ≥1 evidence item that is `independent: true`
**and** `match: match`. Self-reported evidence alone → `unverifiable`. A flipped verdict
stamp is rejected on re-verify.

## See it run
```bash
cd packages/demo
npm run github          # REAL verification against the live GitHub API (not a fixture)
npm run demo            # live "did it book the flight?" clip (honest vs liar)
npm run cross-harness   # one agent under 2 harnesses -> one portable reputation
npm run a2a             # full HTTP end-to-end: A2A agents + verifier + registry
npm run board           # -> ../../site/index.html (public reputation board)

cd ../registry && npm run serve   # optional hosted reputation registry
```

## More
- Spec: [`warrant-spec.md`](./warrant-spec.md) · schema: [`../schema/warrant-0.schema.json`](../schema/warrant-0.schema.json)
- Why it's defensible: [`positioning.md`](./positioning.md) · field analysis: [`gap-analysis.md`](./gap-analysis.md)
- Registry: [`../packages/registry`](../packages/registry) · deploy: [`deploy.md`](./deploy.md) · v3 plan: [`v3-roadmap.md`](./v3-roadmap.md)
