# ⚡ ClockLend Serverless Oracle Keeper

Zero-server, production-ready serverless oracle crank for the **ClockLend** Solana lending protocol.

Replaces dedicated 24/7 Linux keeper servers with modern serverless edge functions (**Cloudflare Workers**, **AWS Lambda**, or **Vercel Cron**).

---

## 🎯 Architecture & Security

* **Zero Mobile Dependency**: The ClockLend mobile app talks **only to Solana RPC/WSS**. It never makes requests to this serverless app.
* **Direct On-Chain Updates**: This worker fetches live prices from Jupiter (with CoinGecko fallback) and updates the on-chain `PriceFeed` PDAs (`[b"oracle", mint]`) using Instruction 12 (`SetPriceFeed`).
* **Enforced Staleness Window**: ClockLend smart contracts enforce a strict **600-second (10-minute)** freshness bound. The cron schedule runs every **3 minutes** (`*/3 * * * *`), giving a 2x safety margin.
* **Secure Key Storage**: The Oracle Authority private key is stored exclusively as an encrypted cloud secret, never exposed to clients or checked into git.

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

### 3. Set Your Oracle Secret Key
Set your oracle authority keypair (supports Base58 private key or JSON array `[1,2,3...]`):
```bash
npx wrangler secret put ORACLE_KEYPAIR
```
*(Optional) If using Jupiter API key for higher rate limits:*
```bash
npx wrangler secret put JUPITER_API_KEY
```

### 4. Configure RPC in `wrangler.toml` (Optional)
By default, `wrangler.toml` uses Solana Devnet. For mainnet, update `RPC_URL`:
```toml
[vars]
PROGRAM_ID = "HAjGxuih14imCMaWvCnJQ3nSdWmS8PQKzp74gyAgjsH3"
RPC_URL = "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY"
NETWORK = "mainnet-beta"
PRIORITY_FEE_MICRO_LAMPORTS = "50000"
```

### 5. Deploy
```bash
npx wrangler deploy
```

That's it! Cloudflare will automatically trigger `scheduled()` every 3 minutes.

---

## 🔍 Health & Monitoring Endpoints

Your deployed worker automatically exposes HTTP endpoints:

* **`GET /health`** or **`GET /`**:
  Queries the live Solana blockchain and returns on-chain price values, last updated timestamps, and freshness status.
  ```json
  {
    "programId": "HAjGxuih14imCMaWvCnJQ3nSdWmS8PQKzp74gyAgjsH3",
    "rpcUrl": "https://api.devnet.solana.com",
    "solFeed": {
      "isInitialized": true,
      "priceUsd": 152.45,
      "decimals": 9,
      "lastUpdated": "2026-09-28T07:15:00.000Z",
      "ageSeconds": 45,
      "isFresh": true
    },
    "skrFeed": {
      "isInitialized": true,
      "priceUsd": 0.0215,
      "decimals": 6,
      "lastUpdated": "2026-09-28T07:15:00.000Z",
      "ageSeconds": 45,
      "isFresh": true
    }
  }
  ```

* **`POST /crank`**:
  Manually trigger an immediate price update transaction (optionally protected by `CRANK_AUTH_TOKEN`).

---

## 🛠️ Local Testing

You can test the crank locally without deploying:

```bash
# Check on-chain oracle status
ORACLE_KEY=~/.config/solana/id.json npm run test:local -- --status

# Execute a live test crank
ORACLE_KEY=~/.config/solana/id.json npm run test:local
```

---

## ☁️ Alternative: Deploying to AWS Lambda

If you prefer AWS:
1. Entry point: `src/lambda.ts` (`export const handler`).
2. Add an **EventBridge Rule** with rate `cron(0/3 * * * ? *)` (every 3 minutes).
3. Set environment variables in Lambda Configuration:
   - `ORACLE_KEYPAIR`
   - `RPC_URL`
   - `PROGRAM_ID`
