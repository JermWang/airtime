# AIRTIME — working notes

Browser-native linear TV network where every display surface is data-driven advertising inventory, paid on Robinhood Chain. See `README.md` for the full architecture.

**Nobody buys a fixed-length spot here.** Each surface runs a continuous descending auction: it asks a price that falls linearly toward a floor, a buyer takes it at the current ask and stays on air until somebody pays more. A sale ratchets the ask to `takeoverPremiumBps` of what was paid and restarts the descent; while a surface is occupied the ask can never fall to or below what the occupant paid, so a takeover is always a higher bid. Everything opens at 0.01 ETH and only demand moves a price up. The curve lives in `src/lib/auction.ts` and is shared verbatim by the server and the browser.

**The room is a theatre with four things for sale.** One picture on the back wall, one display panel either side of it:

| Placement | What it is | Length |
| --- | --- | --- |
| `SHOW` | The picture. Plays whenever a break is not on. | up to 30 min |
| `AD` | The picture during every commercial break. | up to 30 s |
| `PANEL_LEFT` / `PANEL_RIGHT` | The panels beside the picture, always on. | up to 30 s |

Which product a main-stream campaign bought is read off `availability.inventoryMode` (`CONTINUOUS` = the show, `AD_BREAK` = the break), never off a hardcoded id.

## Ground rules for changes here

- **Money is bigint wei.** Never introduce a float into a monetary path. Multipliers are integer basis points (10000 = 1.0x).
- **The browser never decides that something is paid.** A tx hash from the client is only a lookup key; the server reads the `AirtimePurchased` event from its own RPC and re-checks every field against the quote it signed.
- **Inventory is data.** No placement, price or surface may be hardcoded in a React component. Add placements through the control room or `BASE_PLACEMENTS` in `src/server/db/seed.ts`.
- **Submissions can be links.** A show or a spot may be a URL to media hosted anywhere. `src/server/media/link.ts` probes it server-side (SSRF guard, content type, real duration, CORS) before it can be sold against, and the URL is what gets hashed into the quote. Never embed a third-party player: no iframes, no third-party scripts, watch pages are rejected with an explanation.
- **The viewer count is real.** It counts live event streams (`src/server/realtime/presence.ts`). Never seed it, smooth it or floor it at a nicer number.
- **A run has no scheduled end.** `campaigns.endsAt` is null while a campaign is on air and only gets a value when it is outbid, withdrawn or pulled. Never write code that assumes a booked window, and never reintroduce a queue: a surface has exactly one occupant.
- **The price curve is one function.** `computeAsk` in `src/lib/auction.ts` is the only place a price is derived. The server signs quotes from it and the browser draws the ticking number from it, so they cannot drift apart.
- **Advertiser content is hostile.** No HTML/JS/iframe creatives, ever. Uploads are sniffed by magic bytes, decoded, re-encoded and hashed server-side.
- **Never fabricate metrics.** No invented viewer counts. Payment facts (chain) and delivery analytics (application) are always presented separately.
- **Treasury numbers keep their provenance.** Airtime revenue is derived from verified payments and can never be entered by hand; token tax, pre-stock purchases and distributions are operator-recorded and must always be labelled as such.
- **Showcase cards are never fake ads.** They are text-only, permanently badged EXAMPLE, excluded from the queue and from revenue.

## Commands

```bash
pnpm dev                 # station on :3000 (embedded PGlite, seeds DEV DATA)
pnpm studio:build        # regenerate public/models/studio.glb
pnpm chain:local         # anvil
pnpm contract:build && pnpm contract:deploy:local
pnpm test                # vitest (unit + API integration)
pnpm contract:test       # foundry
pnpm test:e2e            # playwright (builds and starts the production server)
pnpm db:reset            # wipe embedded DB + local uploads
```

Note: Next 16 allows only one dev server per directory. Stop `pnpm dev` before `pnpm test:e2e`.

## Gotchas

- `ensureMigrated` and the DB handle live on `globalThis` because Next evaluates a module once per bundle; two PGlite instances on one directory corrupt it.
- Programming media must be CORS-enabled, otherwise WebGL video textures fail. Allowed origins are listed in `NEXT_PUBLIC_MEDIA_ORIGINS` and enforced by the CSP in `src/proxy.ts`.
- The simulation clock is gated by `simulationClockAllowed()` (never on mainnet); E2E sets `AIRTIME_ALLOW_SIM_CLOCK=true`.
- Studio material dressing in `BroadcastStudio` must stay idempotent — it re-runs on tier changes.
- Never delete `.pglite-e2e` from the Playwright config or global setup: both can run while a reused server already owns that directory, and PGlite then fails with "could not open file". The wipe belongs in the web-server command (`tests/e2e/prepare-state.ts`).
- Whether a placement takes over the main picture is the `ownsMainStream` column, not a check on placement type.

## Domain

`airtime.media` (Namecheap) points at the Railway service. Railway holds both names; Namecheap holds the records:

| Host | Type | Value |
| --- | --- | --- |
| `@` | ALIAS | `2lxjusb8.up.railway.app` |
| `www` | CNAME | `mkdf7vpb.up.railway.app` |

Delete Namecheap's parking CNAME and its URL-redirect record first; they conflict. Set `NEXT_PUBLIC_APP_URL=https://airtime.media` on the Railway service once the certificate is issued, because the same-origin check and the CSP are derived from it.

## Hosting

The repo root is the Next.js app; Vercel needs no root override. On any serverless host (`isServerless()` in `src/server/platform.ts`) three things change: the embedded database and local storage are refused outright, and the scheduler runs from `/api/cron/tick` plus an opportunistic tick on read endpoints instead of `setInterval`. Never reintroduce a disk write or a resident timer on a code path that runs there.

## Brand

Accent is the Robinhood lime `#ccff00` on graphite/near-black. Red is reserved for genuine LIVE indicators. "Built on Robinhood Chain" is infrastructure phrasing only. The owner asked for no non-affiliation disclaimer in the UI — do not add one back.
