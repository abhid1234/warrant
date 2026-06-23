# @warrant/registry

An **optional** hosted reputation registry. The verifier never needs it — issuing
and checking a warrant works offline. The registry is the layer that makes
reputation *portable across the ecosystem*: agents submit signed warrants, anyone
reads an agent's context-conditioned reputation. Zero-dep (Node built-ins).

## Trust model
The registry trusts **nothing** it is sent. On every `POST`, it:
1. **re-derives the verdict** from the warrant's own evidence and schema-validates it
   (`verifyWarrant`) — a flipped/forged stamp is rejected;
2. **checks the signature** against a configured trusted key (`verifySignature`) —
   an unknown key or bad signature is rejected.
Only then is the warrant counted.

## Run
```bash
npm run serve            # tsc + node dist/registry/src/server.js  (PORT=8787 default)
npm test                 # integration tests (valid accepted, forged rejected)
```

## API
| Method + path | Returns |
|---|---|
| `POST /warrants` | `{accepted, warrant_id, verdict?, reason?}` — re-verified + sig-checked |
| `GET /reputation` | full context-conditioned reputation (per domain, per agent) |
| `GET /agents/:id/reputation[?domain=]` | one agent's portable reputation |
| `GET /board.json` | all stored warrants (feed a live board) |
| `GET /healthz` | `{ok, warrants}` |

```ts
import { createRegistryServer } from "@warrant/registry";
const { server } = createRegistryServer({ trustedKeys: { "issuer-1": PUBLIC_KEY_PEM } });
server.listen(8787);
```

## Hosting
It's a plain Node HTTP server — deploy to any Node host (Fly, Render, a container,
a VM). **Persistence is out of this v3 cut:** the store is in-process, so it suits a
single long-running instance. A stateless serverless deployment (e.g. Vercel
functions) would need durable storage (KV/Postgres) wired into `store.ts` first —
that's the next step, flagged in [`../../docs/v3-roadmap.md`](../../docs/v3-roadmap.md).
The board can point at `GET /board.json` to render live once the registry is hosted.

Illustrative demo: trusted keys, agents, and warrants are fictional.
