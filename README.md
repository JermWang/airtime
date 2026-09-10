# AIRTIME
Browser-native television and programmable billboards, launching on [StonkFun](https://www.stonkfun.xyz), with native SOL payments on Solana.

## Development
Install Node.js and pnpm, then run:
```sh
pnpm install
# Copy .env.example to .env.local and configure your environment.
pnpm dev --port 3200
pnpm typecheck
pnpm test
pnpm build
```
Without DATABASE_URL, development uses embedded PGlite. A blank SOLANA_TREASURY_ADDRESS disables purchases. Phantom and Solflare are supported through their browser extensions or in-wallet browsers.

## Solana configuration
- NEXT_PUBLIC_SOLANA_NETWORK: devnet, mainnet, or local. Defaults to devnet.
- SOLANA_RPC_URL: a server-only RPC URL for that network. Production should use a dedicated provider.
- SOLANA_TREASURY_ADDRESS: the public key receiving SOL. No treasury signing key is needed by the application.
- NEXT_PUBLIC_SOLANA_TOKEN_MINT: optional AIRTIME SPL mint displayed at launch.
- NEXT_PUBLIC_AIRTIME_TOKEN_DECIMALS: decimals for the optional token ledger; set to match the actual mint before recording token movements.

Native SOL has 9 decimals; 1 SOL = 1,000,000,000 lamports. The minimum and opening price is 0.5 SOL (500,000,000 lamports). Migration 0012 raises existing placement floors to this minimum. Existing field names ending in Wei are retained for database/API compatibility, but new SOL values in them are lamports.

## Payment flow
A server-side reservation holds the surface while the buyer signs. The server constructs a native System Program transfer followed by an exact AIRTIME quote memo, verifies the signed transaction, persists its signature, and broadcasts it. Only finalized, successful Solana transactions matching the stored buyer, treasury, amount and memo can activate a campaign. The scheduler recovers submitted payments after a browser closes. Solana public keys and transaction signatures are case-sensitive.

Reservations are enforced by the server. Native transfers do not atomically revert a losing or late reservation. If finality arrives after the surface changes hands, the payment remains recorded and the campaign is flagged for operator resolution. Refunds must return the full amount from the treasury to the buyer with memo AIRTIME:REFUND:<payment-id>. An operator records the signature; the server verifies finality and prevents reuse.

## Migration and rollout
Migration 0011 snapshots the old placements, campaigns, reservations and activations in chain_migration_snapshots, retires the old live market, and resets opening prices to 0.01 SOL. It retains payment, quote and receipt history. Prior-network revenue is excluded from SOL totals, and historical signatures never link to Solana Explorer.

Before production rollout, configure the actual treasury and matching RPC/network, back up the database, verify the migration in a copy, and run a wallet purchase/refund on devnet. Never copy development secrets to production. Token launch or stock-related policies are separate from the SOL payment integration; no token mint, stock distribution or launch-platform API is invented here.

## Checks
pnpm test covers auction rules, reservations, Solana transfer validation, signature recovery, media validation and treasury accounting. pnpm test:e2e covers the public station and launch UI. Funded network settlement needs the configured devnet wallet.

Deployment note: keep the connected GitHub main branch synchronized with the released Solana code. For coordinated configuration changes, set variables with `--skip-deploys`, then deploy the intended revision and verify the live network and treasury in the control-room overview.

## StonkFun token metrics and rewards

The public `/api/token` endpoint reads StonkFun's documented `/api/public/v1/tokens/{mint}`, `/rewards`, and `/burns` endpoints. It is read-only and requires no API key. The treasury page and home-page treasury figures poll this feed every 60 seconds. Market data and platform rewards are not mixed into the station's advertising-income ledger.

At launch, set `NEXT_PUBLIC_SOLANA_TOKEN_MINT` to the verified AIRTIME CA on the mainnet deployment and rebuild/redeploy (the same setting controls the public CA chips). No other coin is used as a fallback. A missing CA shows "coming soon"; a not-yet-indexed mint is retried. Standard Mode shows no holder rewards. Reward Mode reports the actual paired asset and payout totals from StonkFun. No daily payout time, one-token threshold, or reward cap is invented locally.

Responses are validated against the exact mint and reward asset. Requests are coalesced and cached for one minute per process; upstream Retry-After is honored. Errors retain the last successful snapshot with a stale label and source timestamp; missing numbers are not manufactured as zero. A configured-mint change discards the previous mint's cache. Source data older than fifteen minutes is marked stale.

This integration does not launch a coin, claim fees, send SOL, or execute buybacks. Platform burns and flywheel participation are reported from StonkFun. Spending AIRTIME advertising revenue still needs separate execution and transaction records. Validate the selected launch mode and paired asset on StonkFun before publishing the CA.

Sources: [API documentation](https://www.stonkfun.xyz/developers) and [rewards](https://www.stonkfun.xyz/rewards).
