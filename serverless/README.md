# ⚡ ClockLend Serverless Oracle Keeper

Zero-server, production-ready serverless oracle crank for the **ClockLend** Solana lending protocol.

Replaces dedicated 24/7 Linux keeper servers with modern serverless edge functions (**Cloudflare Workers**, **AWS Lambda**, or **Vercel Cron**).

---

## 🎯 Architecture & Security

* **Zero Mobile Dependency**: The ClockLend mobile app talks **only to Solana RPC/WSS**. It never makes requests to this serverless app.
* **Direct On-Chain Updates**: This worker fetches live prices from Jupiter (with CoinGecko fallback) and updates the on-chain `PriceFeed` PDAs (`[b"oracle", mint]`) using Instruction 12 (`SetPriceFeed`).
* **Enforced Staleness Window**: The on-chain program caps admin-feed pricing at **600 seconds** (`ADMIN_FEED_MAX_PRICE_AGE_SECS` in `program/src/processor.rs`, applied as `feed.max_staleness_seconds.min(...)`). The feed's own stored window is 3600s and is retained for monitoring only. The cron schedule runs every **3 minutes** (`*/3 * * * *`), giving a 2x safety margin.
* **Fail-Closed Cluster Guard**: Before signing, the worker reads `getGenesisHash` and refuses to crank if the endpoint is not the cluster named by `NETWORK`. A worker pointed at a devnet RPC with the mainnet `PROGRAM_ID` fails loudly instead of silently writing devnet feeds.
* **Secure Key Storage**: The Oracle Authority private key is stored exclusively as a Cloudflare secret. It is not in `wrangler.toml` and not in git.

---

## 🚀 Quick Deployment: Cloudflare Workers (Recommended - 100% Free)

Cloudflare Workers provides 100,000 free requests per day. A 3-minute cron is only 480 runs/day, costing **$0.00 / month forever**.

### 1. Install Dependencies
```bash
cd serverless
npm install
```

### 2. Login to Cloudflare
```bash
npx wrangler login
```

### 3. Set Your Secrets
All secrets are set with `wrangler secret put` — none of them live in `wrangler.toml`.

**Oracle authority keypair** (supports Base58 private key or JSON array `[1,2,3...]`):
```bash
npx wrangler secret put ORACLE_KEYPAIR
```

**Crank auth token (required).** `POST /crank` spends the oracle authority's lamports and
writes global protocol prices, so it must never be callable unauthenticated. The endpoint
**fails closed**: if `CRANK_AUTH_TOKEN` is not configured it returns `503` and refuses every
request. Set it before you deploy:
```bash
npx wrangler secret put CRANK_AUTH_TOKEN
```
Then call it with:
```bash
curl -X POST https://<worker>/crank -H "Authorization: Bearer $CRANK_AUTH_TOKEN"
```
> **Hardening note:** a Helius API key was previously committed inside `wrangler.toml`'s
> `[vars]` block, and has since been removed from the text entirely. The worker now reads
> `RPC_URL` from the environment. **The committed value is still valid until it is revoked —
> deleting the text did not rotate it, and it remains readable in git history. Rotate it in
> the Helius dashboard and supply the NEW key as a secret; do not reuse the old one** — see step 4.

**RPC endpoint.** `RPC_URL` is intentionally not in `[vars]` (commented values there are
plaintext in git). Set it as a secret:
```bash
npx wrangler secret put RPC_URL
# paste: https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY
```
If `RPC_URL` is unset the worker falls back to `https://api.mainnet-beta.solana.com`, which
is rate-limited and not suitable for a production 3-minute cron.

*(Optional) Jupiter API key for higher rate limits:*
```bash
npx wrangler secret put JUPITER_API_KEY
```

### 4. Non-secret configuration lives in `wrangler.toml`
```toml
[vars]
PROGRAM_ID = "4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7"
NETWORK = "mainnet-beta"
PRIORITY_FEE_MICRO_LAMPORTS = "25000"
```
`NETWORK` and the RPC endpoint must agree — the worker compares the endpoint's
`getGenesisHash` against the expected genesis hash for `NETWORK` and refuses to sign on a
mismatch (mainnet-beta = `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`,
devnet = `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`).

### 5. Deploy
```bash
npx wrangler deploy
```

That's it! Cloudflare will automatically trigger `scheduled()` every 3 minutes.

---

## 🔍 Health & Monitoring Endpoints

Your deployed worker automatically exposes HTTP endpoints:

* **`GET /health`** or **`GET /`**:
  Reads the live Solana blockchain and reports both price feeds, their ages, the cluster it is
  actually talking to, and the last crank this isolate observed. Returns **200** when every feed
  is inside the alert threshold and **503** when any feed is stale, missing, or the cluster /
  program id does not match — so an uptime monitor on this URL pages you.
  ```json
  {
    "programId": "4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7",
    "expectedProgramId": "4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7",
    "programIdMatchesTarget": true,
    "network": "mainnet-beta",
    "genesisHash": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    "genesisMatchesNetwork": true,
    "rpcUrl": "https://mainnet.helius-rpc.com/?api-key=REDACTED",  # credentials are redacted in responses
    "solFeed": {
      "isInitialized": true,
      "priceUsd": 120.18,
      "decimals": 9,
      "lastUpdated": "2026-09-29T04:03:48.000Z",
      "ageSeconds": 45,
      "isFresh": true,
      "shouldAlert": false,
      "priceAgeLimitSeconds": 600
    },
    "skrFeed": { "...": "same shape" },
    "oldestFeedAgeSeconds": 46,
    "stalenessAlertThresholdSeconds": 540,
    "staleFeeds": [],
    "healthy": true,
    "lastCrank": {
      "signature": "5xQ...",
      "solPrice": 120.18,
      "skrPrice": 0.0186,
      "timestamp": "2026-09-29T04:04:00.000Z"
    }
  }
  ```
  When any feed passes **540 seconds** the worker logs a `STALE PRICE FEEDS` alert line (visible
  in `wrangler tail`) naming the feed and its age, so the 600s on-chain pricing cliff is never a
  surprise. `lastCrank` is per-isolate best-effort state — Cloudflare recycles isolates freely, so
  treat `null` as "unknown", not "never cranked".

* **`POST /crank`**:
  Manually trigger an immediate price update transaction. **Requires**
  `Authorization: Bearer <CRANK_AUTH_TOKEN>`; returns **401** on a bad token and **503** when
  `CRANK_AUTH_TOKEN` is not configured at all (fail closed).

---

## 🛠️ Local Testing

You can test the crank locally without deploying. The runner reads `NETWORK`, `RPC_URL`,
and `PROGRAM_ID` from the environment (and auto-loads the repo-root `.env`):

```bash
cd serverless

# Check on-chain oracle status against mainnet-beta
NETWORK=mainnet-beta ORACLE_KEY=~/.config/solana/mainnet-keeper.json npm run test:local -- --status

# Execute a live crank (spends real lamports — mainnet)
NETWORK=mainnet-beta ORACLE_KEY=~/.config/solana/mainnet-keeper.json npm run test:local
```

`ORACLE_KEY` is a *file path* convenience wrapper; `ORACLE_KEYPAIR` (the raw JSON array or
Base58 string) is what the code reads.

---

## ☁️ Alternative: Deploying to AWS Lambda

If you prefer AWS:
1. Entry point: `src/lambda.ts` (`export const handler`).
2. Add an **EventBridge Rule** with rate `cron(0/3 * * * ? *)` (every 3 minutes).
3. Set environment variables in Lambda Configuration:
   - `ORACLE_KEYPAIR` (required — store via Secrets Manager / SSM, not plaintext)
   - `CRANK_AUTH_TOKEN` (**required** — the Lambda's `POST /crank` now fails closed with 503
     when it is unset, matching the Cloudflare worker. Authenticate only genuine scheduled
     events: EventBridge sets `source: "aws.events"`, and an HTTP request can never reach the
     cron branch — payload-format-2.0 events from HTTP APIs / Function URLs carry no top-level
     `httpMethod`, which previously caused web requests to be treated as scheduled events.)
   - `RPC_URL`
   - `PROGRAM_ID`
   - `NETWORK` (`mainnet-beta`)
