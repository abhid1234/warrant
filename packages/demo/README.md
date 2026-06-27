# @warrant/demo

The end-to-end demo (spec v0): two agents over A2A — one genuinely books the
flight, one reports `COMPLETED` but lied — and Warrant issues a **green vs. red
warrant live**. Plus a static **public reputation board** generated from the
warrants. Zero dependencies; no server.

## Run it
```bash
npm run github         # REAL verification against the live GitHub API (not a fixture)
npm run demo           # the live "did it book the flight?" clip (console)
npm run cross-harness  # one agent under 2 harnesses -> one portable reputation (v2)
npm run a2a            # live HTTP end-to-end: airline + 2 A2A agents + verifier + registry (v3)
npm run board          # generates ../../site/index.html from the warrants
```
Both build `@warrant/verify` + this package with `tsc` first (no npm install at
runtime). Open the board at `site/index.html` via `file://`.

## What the demo shows
Both agents advertise the Warrant A2A extension in their Agent Card and both
return task status `COMPLETED`. A2A's **opaque-execution** principle means the
caller can't see how the work was done — the status is all it gets. Warrant then
probes the **world** (the airline reservation system, independent of the agents):

- **TravelBooker** actually booked → independent PNR lookup confirms → **✓ warranted**
- **CheapBooker**'s payment failed but it claimed success with a fabricated code →
  PNR lookup returns `NOT_FOUND` → **✗ refuted**

The verdict comes from the world-state probe, **not** the agents' logs — the log is
exactly what the lying agent fabricated.

## The reputation board
`build-board.ts` issues 17 warrants across three skills (`travel.booking`,
`payments.refund`, `code.bugfix`) using the real verifier, then renders a
self-contained HTML board. Reputation is **context-conditioned**: `CheapBooker` is
`0%` at booking but `100%` at refunds — the same agent at opposite ends of the
Agent × context matrix. That is the point: good-at-refunds ≠ good-at-booking.

## Files
- `world.ts` — the ground-truth airline system the verifier probes (agents can't fake it)
- `agents.ts` — honest vs. lying booker, each over an A2A-shaped interface + Agent Card
- `scenarios.ts` — the live flight pair + the seeded multi-domain warrant set
- `run.ts` — the live console clip
- `build-board.ts` — the static board generator (→ `site/`)

Illustrative demo data — agents, systems, and signatures are fictional.
