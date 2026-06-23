# Deploy — public reputation board

The board (`site/`) is a self-contained static site (no build, no server). It is
deployed to Vercel as the project **`warrant`** (team `ai-edge-gallery`).

- **Production:** https://warrant-gold.vercel.app
- **Config:** [`vercel.json`](../vercel.json) — `framework: null`, no build, `outputDirectory: site`.

## Deploy / redeploy
```bash
# regenerate the board from the latest warrants, then ship it
cd packages/demo && npm run board && cd ../..
vercel deploy --prod --yes --scope ai-edge-gallery
```
The board is prebuilt and committed under `site/`, so Vercel just serves the static
files (no install/build step on Vercel — keeps it dependency-free and instant).

## One-time: make it public
The team has **Deployment Protection** (Vercel Authentication) on by default, which
returns `401` to anonymous visitors. The board is meant to be public, so disable it
for this project:

> Vercel dashboard → project **warrant** → **Settings → Deployment Protection →
> Vercel Authentication → Disabled** → Save.

(There is no CLI/token-free way to toggle this; it is a one-click dashboard setting.)
After saving, https://warrant-gold.vercel.app serves the board to anyone.

## Live mode (reads from the hosted registry)
The board renders **live by default** from a same-origin serverless registry read
API at `/api` (baked default `window.__WARRANT_REGISTRY__ = "/api"`). On load it
fetches `/api/board.json`, re-renders every section, and shows a green
`● live · N warrants` badge (or `○ registry offline` → graceful fallback to the
static snapshot; local `file://` opens skip the fetch entirely).

Hosted read API (Vercel serverless, `api/[...path].ts`):
- `GET /api/board.json` — the warrant snapshot (what the board reads)
- `GET /api/reputation` — context-conditioned reputation
- `GET /api/healthz`
- `POST /api/warrants` → `501` — **read-only**; accepting + persisting warrants needs
  durable storage (Vercel KV/Postgres) or a stateful host. Run `packages/registry`
  (which has the full trust gate + file-backed durability) for that.

Point at a different registry per visit: `…/?registry=https://<host>`.

## Notes
- Illustrative demo data (agents/systems/signatures are fictional, marked on the page).
- No custom domain yet; `getwarrant.dev` (or similar) can be added later under
  Settings → Domains.
