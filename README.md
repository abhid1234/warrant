# Warrant

**Open world-state outcome-verification + portable reputation for inter-agent calls.**

[![npm](https://img.shields.io/npm/v/@avee1234/warrant-verify?color=2b8a3e&label=npm%20%40avee1234%2Fwarrant-verify)](https://www.npmjs.com/package/@avee1234/warrant-verify)
[![live board](https://img.shields.io/badge/live-reputation%20board-2b8a3e)](https://warrant-gold.vercel.app)
[![tests](https://img.shields.io/badge/tests-27%20passing-2b8a3e)](packages/)
[![deps](https://img.shields.io/badge/dependencies-zero-555)](packages/verify/package.json)
[![license](https://img.shields.io/badge/license-MIT-555)](LICENSE)

When one agent hires another (over A2A/MCP), Warrant independently checks the **world state** to prove the work *actually happened*, then issues a signed **warrant** (intent → claimed outcome → independent verification → verdict → signature). Verified warrants roll into a **portable reputation** the agent carries everywhere.

> To *warrant* something = to certify it's true.
> **No claim without a warrant.** Your agent says it booked the flight — did it? Get the warrant.

**Live board:** https://warrant-gold.vercel.app · **npm:** `npm i @avee1234/warrant-verify` · **CLI:** `npx @avee1234/warrant-verify verify <file>`

## The wedge
Every inter-agent standard today (MCP, A2A, AGNTCY, AP2, ERC-8004) answers *"is this agent who it claims, and was it authorized?"* — **none answers *"did the agent actually do what it claimed?"*** And the whole field verifies the **trace** (the agent's self-reported log — exactly what a silently-failing agent lies in), not the **world-state outcome**. That distinction is the moat.

- **Non-crypto, enterprise-friendly** (ERC-8004 owns the on-chain path).
- **An A2A extension, not a new transport** (A2A/MCP own transport).
- **Outcome, not trace** — verify against ground truth, not the self-reported log.

## How the portfolio folds in
| Layer | Source |
|-------|--------|
| Evidence / format substrate | **OpenTrajectory** (shipped) — a warrant's body is an OpenTrajectory record |
| Verifier engine | **TrueCall** — runtime outcome / post-condition checking |
| Verification brain | **RL Trajectory Auditor / Inspector** (shipped, validated judge) — reused as-is |
| New on top | Warrant schema · portable verified reputation · public reputation board |

## Status
v1 (spec + verifier + demo + board) and v2 (cross-harness portable reputation) shipped;
v3 in progress (real probes, hosted registry, live A2A, SDK/DX). See [`STATUS.md`](./STATUS.md)
and [`docs/quickstart.md`](./docs/quickstart.md). Full spec + hard constraints in [`CLAUDE.md`](./CLAUDE.md).
Board live at https://warrant-gold.vercel.app *(pending the one-time protection toggle in [`docs/deploy.md`](./docs/deploy.md))*.

```bash
cd packages/verify   && npm test            # zero-dep verifier, 22/22
cd packages/demo     && npm run demo         # live "did it book the flight?" clip
cd packages/demo     && npm run cross-harness# one agent, 2 harnesses -> one portable reputation
cd packages/demo     && npm run a2a          # full HTTP end-to-end: A2A + verifier + registry
cd packages/demo     && npm run board        # -> site/index.html (public reputation board)
cd packages/registry && npm test             # registry trust gate (valid accepted / forged rejected)
```

## Layout
```
docs/              # gap-analysis (GO), warrant-spec, positioning, quickstart, deploy, v3-roadmap
schema/            # warrant-0.schema.json (machine-readable spec companion)
examples/          # hand-authored warrants (green + red) + a2a-extension manifest
packages/verify/   # zero-dep verifier — world-state probes, verdict engine, signing, schema, reputation, CLI
packages/demo/     # two-agent A2A demo (one lies), cross-harness, live A2A end-to-end, board generator
packages/registry/ # optional hosted reputation registry (re-verifies + sig-checks every warrant)
site/              # generated public reputation board (index.html, openable via file://)
```
