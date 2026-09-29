# ClockLend — Mainnet Runbook

Status: program v13 (round-8/9 hardening + round-10/11 fixes + round-12 Pyth removal +
round-13 tag pinning; admin-feed-only pricing, 600s staleness, oracle-free 30% LTV cap,
yield rescue instruction).
**Devnet runs the round-12 build** — ProgramData `76MvPRVKdsthzyBQhFnfqgd7QtjebiAGCLNTA56nCgMB`
(366,389 B total / 357,501 B used / 8,888 B zero padding), ELF 357,456 bytes,
md5 `a2986fde` (byte-verified; extend tx `63mmLPNK…` +10,240 B, upgrade tx `5joqBgtE…`).
Mainnet bootstrap is prepared but **not executed** (deployer wallet has 0 mainnet SOL).
Follow this checklist in order.

## 0. Keypairs & Funding Pre-flight

ClockLend enforces strict separation of concerns across 3 dedicated keypairs:

| Role | Purpose | File Location | Public Address | Funding Required |
|---|---|---|---|---|
| **Deployer** | Upgrade Authority & Protocol Admin | `~/.config/solana/mainnet-deployer.json` | `8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds` | **2.0 SOL** |
| **Keeper** | Serverless Oracle Price Feeder | `~/.config/solana/mainnet-keeper.json` | `HtiDpTkcWDDaQeRLSBvYDdw2sRJb5VvkD7EMvr5JWVzJ` | **0.1 SOL** |
| **Program ID** | Mainnet Smart Contract Address | `~/.config/solana/clock-lend-program.json` | `4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7` | *None (rent paid by deployer)* |

### 0.1 Program ID Keypair Resolution
A **first-time deploy** on Solana mainnet requires the Program ID's private keypair file (`PROGRAM_KEYPAIR`) so the Solana CLI can prove ownership and initialize the program account:

* **Option A (Original Address):** If you possess the private key for `HAjGxuih14imCMaWvCnJQ3nSdWmS8PQKzp74gyAgjsH3`, copy it to:
  ```bash
  cp /path/to/keypair.json ~/.config/solana/clock-lend-program.json
  ```
* **Option B (Fresh Mainnet Address):** If the devnet key was not preserved, generate a fresh mainnet keypair:
  ```bash
  solana-keygen new --outfile ~/.config/solana/clock-lend-program.json --no-bip39-passphrase
  NEW_PID=$(solana-keygen pubkey ~/.config/solana/clock-lend-program.json)
  echo "New Mainnet Program ID: $NEW_PID"
  ```
  *(If using Option B, update `declare_id!("...")` in `program/src/lib.rs` and `mobile/src/solana/program.ts`, then recompile with `cd program && cargo build-sbf`).*

### 0.2 Exact SOL Rent & Fee Breakdown
Fund the **Deployer Wallet** (`5avuk58DjBwBsyWkhgp6efC5WbnUKTFA5iLkbS8Aqv29`) with **`2.0 SOL`**:
* **ProgramData Account** (357,517 bytes): **1.81684 SOL** *(Locked rent exemption; 100% refundable if program is closed)*
* **Program Account** (36 bytes): **0.00083 SOL**
* **AdminConfig PDA** (73 bytes): **0.00102 SOL**
* **2× PriceFeed PDAs** (SOL & SKR): **0.00230 SOL**
* **LendingPool PDA & Token Vaults**: **~0.00243 SOL**
* **Write-Buffer Transaction Fees**: **~0.00180 SOL** *(~360 chunk transactions × 5,000 lamports)*
* **Priority Fee Buffer & Margin**: **~0.09500 SOL** *(Prevents dropped chunks during Solana network congestion)*
* **Total Enforced Floor:** `deploy-mainnet.mjs` enforces `requiredRent + 0.1 SOL` (**1.91684 SOL**).

Fund the **Keeper Wallet** (`HtiDpTkcWDDaQeRLSBvYDdw2sRJb5VvkD7EMvr5JWVzJ`) with **`0.1 SOL`**:
* Pays for months of micro-transactions to update the on-chain oracle PDAs.

Verify balances before proceeding:
```bash
solana balance 5avuk58DjBwBsyWkhgp6efC5WbnUKTFA5iLkbS8Aqv29 --url mainnet-beta
solana balance HtiDpTkcWDDaQeRLSBvYDdw2sRJb5VvkD7EMvr5JWVzJ --url mainnet-beta
```

---

## 1. Deploy (One Command)

```bash
cd /home/rootkit/lend
export DEPLOYER_KEY=~/.config/solana/mainnet-deployer.json
export ORACLE_KEY=~/.config/solana/mainnet-keeper.json
export PROGRAM_KEYPAIR=~/.config/solana/clock-lend-program.json
export MAINNET_RPC="https://api.mainnet-beta.solana.com" # or your Helius/Triton mainnet RPC

node mobile/scripts/deploy-mainnet.mjs --create-pool --rotate-oracle
```

### What this script executes in sequence:
1. Preflights rent exemption and wallet balances.
2. Writes the 357 KB bytecode buffer and deploys the upgradeable program.
3. Calls `InitializeAdmin` (tag 13) with ProgramData upgrade-authority proof (`admin = deployer key`).
4. Rotates `oracle_authority` to the dedicated Keeper key (`HtiDpTkc...JWVzJ`).
5. Creates the protocol Treasury USDC Associated Token Account (`EPjFWdd5...`, owner = Treasury PDA).
6. Seeds initial live SOL and SKR price feeds from Jupiter Price API v3.
7. Initializes the first Lending Pool Desk with on-chain parameter verification.

---

## 2. Serverless Oracle Pricing (Cloudflare Workers + GitHub Actions)

ClockLend uses an **admin PriceFeed PDA** architecture with a fail-closed 600-second staleness bound. No dedicated 24/7 Linux server/VPS is required.

### 2.1 Primary Runner: Cloudflare Workers
Runs serverless on Cloudflare's edge network every 3 minutes (`*/3 * * * *`):

```bash
cd /home/rootkit/lend/serverless

# 1. Update wrangler.toml [vars] with your Mainnet RPC (Helius/Triton)
# 2. Add your Mainnet Keeper private key as a cloud secret:
npx wrangler secret put ORACLE_KEYPAIR
# (Paste the JSON array from: cat ~/.config/solana/mainnet-keeper.json)

# 3. Deploy to Cloudflare
npx wrangler deploy
```

Live status and health can be queried at:
`https://clocklend-oracle-keeper.clockit.workers.dev/health`

### 2.2 Secondary Failover Runner: GitHub Actions
To eliminate any single point of failure (if Cloudflare ever experiences network downtime):
1. In your GitHub repository, navigate to **Settings** ➔ **Secrets and variables** ➔ **Actions**.
2. Add secret **`KEEPER_KEYPAIR_JSON`** containing the JSON from `~/.config/solana/mainnet-keeper.json`.
3. The `.github/workflows/keeper.yml` workflow automatically runs on Microsoft Azure infrastructure every 6 minutes as a secondary safety net.

### 2.3 Manual Verification & Status Check
Query the on-chain oracle PDAs directly from your terminal:
```bash
RPC_URL="https://api.mainnet-beta.solana.com" node serverless/src/cli.mjs --status
```

---

## 2b. SKR yield vault (dividends)

- The deploy script initializes the vault automatically (admin-gated tag 15, reward
  mint = USDC `EPjFWdd5…`). PDAs: vault `[skr_yield_vault, EPjFWdd5]`, vault token
  `[skr_yield_token, EPjFWdd5]`, user positions `[skr_yield_user, user, EPjFWdd5]`.
- Funding: the app appends the two vault PDAs to every borrow (when the vault is
  initialized), routing **50% of the origination fee** to yield holders — no keeper job.
  Manual alternative: the vault authority (deployer key) may call DepositSkrYield
  (tag 16, authority-gated).
- Claims: tag 17. The stake is read from the SKR escrow token account (the single
  source of truth — unstaking immediately removes shares). A **1-hour cooldown**
  applies after each payout or stake change (`YieldCooldown`, error 38). Deposits made
  while nobody is staked are parked in `unallocated_rewards` and folded into the next
  allocation — never stranded.
- Rescue: tag 18 `WithdrawUnusedYield` (authority-only) recovers EXTERNALLY-DONATED
  vault tokens beyond `pending_rewards`; program-internal stranding (forfeits,
  phantom shares) is not reachable by it by design.
- Note: the SKR mint does not exist on devnet, so devnet yield testing requires a
  devnet SKR mint; mainnet has `SKRbvo6Gf…` (6 decimals).

## 3. Verify (after deploy)

- `solana program show --url m HAjGxuih14imCMaWvCnJQ3nSdWmS8PQKzp74gyAgjsH3`
  (Note on verification: ProgramData accounts on Solana retain the maximum historical
  allocated size and do not shrink on upgrade. When comparing bytecode, fetch the ProgramData
  account, slice exactly `data[45..45+<local .so size>]` (offset 45 skips the BPF upgradeable
  metadata header), and compare its hash to `md5sum` or `sha256sum program/target/deploy/clock_lend.so`.
  Any bytes beyond `45 + local_elf_size` are historical zero-padding).
- Admin PDA `9vX4JBN…Zn7Hq` contains `CLK_ADMN` with
  `admin = 5avuk58D…Qv29` (deployer) and `oracle_authority = HtiDpTk…JWVzJ` (keeper).
- Global SOL feed PDA `A4hjbxYH…oBXu` (same PDA address on mainnet) is fresh.
- Treasury ATA for `EPjFWdd5` owned by treasury PDA `6yY4P4x2…L4dq` exists.
- The SkrYieldVault PDA (CLK_SYLD, 121 bytes, `is_initialized = 1`, `authority` =
  deployer key) and its vault token account exist and are owned by the program / token
  program respectively.
- Note: `program/target/deploy/clock_lend-keypair.json` is a build artifact with a RANDOM
  key — it is not the program-id keypair. Keep the real `HAjGxuih…` keypair (and its
  backup) separate from the build tree, and commit `program/Cargo.lock` so the hash check
  builds the same ELF everywhere.

## 4. Risks to accept (documented design decisions)

| Risk | Mitigation |
|---|---|
| Single admin/oracle key can move all global prices | Keep the key offline; keeper uses a **separate** `oracle_authority` (rotate via `InitializeAdmin` with the upgrade-authority key) |
| Price manipulation / stale SOL price | Keeper cadence < 10 min (600 s pricing bound, fail-closed); bounded price (≤ $1M/token) and decimals (1–18); pool-scoped feeds exist for pools that want their own pricing |
| P2P funders must verify the offer's on-chain `liquidity_mint` | Show mint in the UI before funding (mobile TODO) |
| Pool authority keys are irrevocable (no rotation instruction) | Deploy desks with durable keys |
| No LP shares — only the pool authority can deposit/withdraw | Document as single-owner desks (product decision) |
| Upgrade authority = deployer key | Store offline; rotate via `set-upgrade-authority` if needed — `InitializeAdmin` stays valid (ProgramData-derived) |

## 5. Upgrading the program later

If the new ELF is LARGER than the current ProgramData allocation, extend first
(agave caps additional bytes at 10,240 per call — repeat as needed):

```bash
solana program extend --url mainnet-beta --keypair $DEPLOYER_KEY \
  HAjGxuih14imCMaWvCnJQ3nSdWmS8PQKzp74gyAgjsH3 10240
```

Then:

```bash
cd program && cargo build-sbf
solana program write-buffer --url mainnet-beta --keypair $DEPLOYER_KEY target/deploy/clock_lend.so
solana program deploy --url mainnet-beta --keypair $DEPLOYER_KEY \
  --program-id HAjGxuih14imCMaWvCnJQ3nSdWmS8PQKzp74gyAgjsH3 --buffer <BUFFER>
```

Note the known CLI quirk: `solana program deploy <file>` can appear to no-op; the
write-buffer + `--buffer` flow is the reliable path.

## 6. Treasury Operations: Profit Withdrawal & SKR Buyback / Burn

Protocol revenue (loan origination fees, 15% interest take-rates, and 5% liquidation margins) accumulates continuously in the **ClockLend Treasury PDA** (`6yY4P4x29kpJKKkwCTFAvJp4uyPuei4NZix8Vs2xL4dq`).

### Inspecting Live Treasury Balances
```bash
node scripts/burn-skr.mjs --status --network mainnet
# Or check raw balances via withdraw-treasury
node scripts/withdraw-treasury.mjs --status --network mainnet
```

### 30% Protocol Revenue Buyback & Burn
To drive continuous deflation, **30% of all project revenue is dedicated to buying and burning $SKR tokens**:

#### Direct Burn (When Treasury holds SKR)
Defaulters with SKR collateral or borrowers paying fees in SKR deposit SKR directly into the Treasury PDA. Direct Burn atomically withdraws and destroys SKR on-chain without any DEX fees or slippage:
```bash
# Burn 30% of current Treasury SKR
node scripts/burn-skr.mjs --direct --pct 30 --network mainnet

# Or burn a specific amount of SKR (e.g. 10,000 SKR)
node scripts/burn-skr.mjs --direct --amount 10000 --network mainnet
```

#### Buy & Burn (Using Treasury USDC or SOL via Jupiter DEX)
Use accumulated USDC or SOL profits to purchase SKR on Jupiter DEX and immediately burn them:
```bash
# Spend 30% of all Treasury USDC to buy & burn SKR
node scripts/burn-skr.mjs --buy --token usdc --pct 30 --network mainnet

# Spend 30% of all Treasury SOL to buy & burn SKR
node scripts/burn-skr.mjs --buy --token sol --pct 30 --network mainnet

# Or specify a fixed dollar amount (e.g. 100 USDC)
node scripts/burn-skr.mjs --buy --token usdc --amount 100 --network mainnet
```


### Withdrawing Developer Profit to Cold Storage
To withdraw USDC or SOL directly to a personal wallet, operating account, or multisig:
```bash
node scripts/withdraw-treasury.mjs --amount 500 --token usdc --dest <YOUR_WALLET> --network mainnet
node scripts/withdraw-treasury.mjs --amount 2.5 --token sol --dest <YOUR_WALLET> --network mainnet
```

