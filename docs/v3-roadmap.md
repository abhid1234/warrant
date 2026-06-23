# v3 — roadmap

v1 (spec + verifier + demo + board) and v2 (cross-harness portable reputation) are
merged. v3 productizes: make the probes real, make reputation a service, prove the
A2A path end-to-end, and make it adoptable.

## Constraint reconciliation
Hard-constraint #6 ("no *required* server") was about the **verifier/judge** running
on-device. It still holds: `@avee1234/warrant-verify` runs offline with zero deps. v3's hosted
registry is an **optional** layer on top — issuing and verifying a warrant never
requires it. The registry itself is written zero-dep (Node built-ins) and re-verifies
every warrant (and its signature) before counting it, so it trusts nothing it's sent.

## Increments (dependency order)
1. **Real probes** — `@avee1234/warrant-verify` probes that hit real world-state: an HTTP/JSON
   probe (fetch a source, compare to the claim) + a generic injectable `queryProbe`
   (plug a DB/CI client). Turns the demo's fixtures into reusable adapters. *(zero-dep)*
2. **Hosted reputation registry + API** — `packages/registry/`: a zero-dep Node HTTP
   service. `POST /warrants` re-verifies + signature-checks + stores; `GET
   /agents/:id/reputation` returns portable, context-conditioned reputation; `GET
   /board.json` feeds the board live. Ships with Vercel function adapters.
3. **Live A2A** — a minimal A2A-shaped server that declares the warrant extension and,
   on task completion, issues a warrant (real probe) and posts it to the registry.
   Replaces the mocked demo interface; proves "rides A2A, not a new transport".
4. **SDK / DX + publish** — `@avee1234/warrant-verify` as a publishable package with an `npx
   warrant` bin, a quickstart, and an API reference. Lowers adoption cost.

## Acceptance
- (1) An HTTP probe issues a correct verdict against a live endpoint.
- (2) `POST` a forged warrant (bad signature or unjustified verdict) → rejected; a
  valid one → counted; `GET reputation` reflects it.
- (3) An A2A task completion produces a warrant in the registry, visible on the board.
- (4) `npx warrant verify <file>` works from a clean install.

## Follow-ups done (after the 4 increments)
- **Durable storage** — the registry takes a `dataFile` and persists accepted warrants to
  disk, re-loading + re-verifying on startup (a tampered file drops bad entries). Zero-dep,
  single-host durability; a KV/Postgres adapter remains a drop-in for scale.
- **Live board** — the board renders live from a hosted registry via `?registry=<url>`
  (fetches `/board.json`, re-renders, shows a live badge; graceful offline fallback).
  Verified end-to-end locally.

## Out of scope (still)
Durable *managed* storage (KV/Postgres adapter) for stateless/serverless hosting. Billing.
Crypto/on-chain. New transport. `npm publish` of further packages.
