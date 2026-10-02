# ClockLend — Mainnet Runbook

Status: **deployed and live on Solana Mainnet-beta.** Every address and hash in this
document was read from mainnet-beta RPC on 2026-10-02 and can be re-verified with the
commands given. Where something is *not* done, it says so explicitly.

> Round-15 audit context: Round-15 program hardening fixes are **deployed and verified on-chain**
> on 2026-10-02. The on-chain bytecode was re-verified against a local `cargo-build-sbf` build
> and matched byte-for-byte over all 371,632 non-padding bytes.

---

## 0. Live deployment facts (verified)

| Field | Value |
|---|---|
| Cluster | mainnet-beta, genesis `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` |
| Program ID | `4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7` |
| ProgramData | `9ikmDTbbRhtgYKjRhcnzCK9RpPWQ8uTYUeNJ16kWMLSG` |
| Allocated bytes | `377,997` (ELF is `371,632`; the remainder is retained zero padding) |
| Upgrade authority | `8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds` |
| Bytecode sha256 | `6a3375bf6c7deea30ae0a94c35323f3b2dfd892234bae9e5c5940f2d23afc69d` |
| AdminConfig PDA | `7tCidaB2vu5N8KfKJ2Mqfm5dxbkvSqqvxHqkznYveroi` (`CLK_ADMN`, 73 B) |
| `admin` | `8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds` |
| `oracle_authority` | `HtiDpTkcWDDaQeRLSBvYDdw2sRJb5VvkD7EMvr5JWVzJ` |
| SOL feed PDA | `49b74tSY5EgaTHUA3GZLJFJ3piwfkNUgXz9itachPyyH` (`CLK_FEED`, 98 B) |
| SKR feed PDA | `Fpcvf78bzAkdeKzvB6ZqgudzmWWvs4detDpEkmz1W6X8` (`CLK_FEED`, 98 B) |
| Lending pool | `4YC4rCNXva8ty6f1pKRC2NX7e5kufqowBYJDCMor12Wu` (`CLK_POOL`, 200 B) |
| SKR yield vault | `6tY1CpFg9gr7nXZcgxX8WvBXGgKozd3URXzwFnChQQx4` (`CLK_SYLD`, 121 B) |
| Treasury PDA | `5buCUcCHHDCzQpanMKCK8uruErL5D2UzSFVrbtPrKV7y` — **no account on chain yet** |
| Treasury USDC ATA | `9UozceLNGCansqNeDcGFvirwLrnCyrTQFRSKGvmfnG63` — exists, **0 USDC** |

**Only these five program-owned accounts exist on mainnet:** the two feeds, the pool, the
AdminConfig PDA, and the SKR yield vault. There are **no loans, offers, or user profiles**,
the pool has `total_liquidity = 0` / `loans_originated = 0`, and the treasury has never been
initialized (so no fee has ever been collected). ClockLend has been deployed, not used.

### 0.1 Two different program ids — do not mix them up

| Cluster | Program ID | Exists there? |
|---|---|---|
| **mainnet-beta** | `4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7` | yes |
| devnet | `HAjGxuih14imCMaWvCnJQ3nSdWmS8PQKzp74gyAgjsH3` | yes |

Neither exists on the other cluster (verified with `getAccountInfo`). Commands in this
runbook target mainnet; using `HAjGxuih…` against mainnet fails with "account not found".

---

## 1. Keypairs & identities

| Role | File location | Public address | Notes |
|---|---|---|---|
| **Deployer / upgrade authority / admin** | `~/.config/solana/mainnet-deployer.json` | `8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds` | Single key. Not a multisig, not timelocked. |
| **Keeper (oracle authority)** | `~/.config/solana/mainnet-keeper.json` | `HtiDpTkcWDDaQeRLSBvYDdw2sRJb5VvkD7EMvr5JWVzJ` | Signs price-feed updates only. |
| **Program ID keypair** | `~/.config/solana/clock-lend-program.json` | `4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7` | Needed only for a **first** deploy. |

**Deployer identity reconciliation.** `5avuk58DjBwBsyWkhgp6efC5WbnUKTFA5iLkbS8Aqv29` appears
in older notes as the deployer. It is the **pre-bootstrap** key (kept only as a `.bak`) and was
**never funded on mainnet**. It is *not* the upgrade authority and holds no role on chain. The
live identity is `8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds` — confirm before trusting any
older document:

```bash
solana program show 4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7 --url mainnet-beta
```

### 1.1 Verifying the deployed bytecode (the real recipe)

ProgramData retains the *maximum historical* allocation and never shrinks on upgrade, so you
must slice exactly the ELF's own length. Offset 45 skips the BPF upgradeable metadata header
(4-byte enum tag + 8-byte slot + 1-byte Option flag + 32-byte authority).

```bash
cd /home/rootkit/lend
sha256sum program/target/deploy/clock_lend.so
# then fetch ProgramData, decode base64, and hash data[45 : 45+357472]
```

Equivalent one-liner:

```bash
curl -s https://api.mainnet-beta.solana.com -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["9ikmDTbbRhtgYKjRhcnzCK9RpPWQ8uTYUeNJ16kWMLSG",{"encoding":"base64"}]}' \
| python3 -c "
import sys,json,base64,hashlib,os
d=base64.b64decode(json.load(sys.stdin)['result']['value']['data'][0])
n=os.path.getsize('program/target/deploy/clock_lend.so')
print(len(d),'bytes allocated')
print(hashlib.sha256(d[45:45+n]).hexdigest(),'<-- on-chain ELF, sliced to the local ELF size')
"
# expect 377997 / 6a3375bf6c7deea30ae0a94c35323f3b2dfd892234bae9e5c5940f2d23afc69d
```

Any bytes past `45 + local_elf_size` are historical zero padding and must **not** be hashed.

---

## 2. Oracle keeper (price feeds)

ClockLend is **admin-feed-only** (Pyth was removed). The feeds just described are the sole
price source, and the program caps admin-feed pricing at **600 s**
(`processor.rs`: `feed.max_staleness_seconds.min(ADMIN_FEED_MAX_PRICE_AGE_SECS)`). The stored
`max_staleness_seconds` on chain is **3600**, retained for monitoring only — the effective
bound is 600 s. Past that, borrow and liquidation paths that read a feed revert with
`StaleOraclePrice`.

> **Current state: the keeper is not running reliably.** Both feeds were observed ~14,100 s
> stale (~3.9 h). Until they are refreshed, borrows that price against them will revert. This
> is an open ops finding, not a program bug.

### 2.1 Primary runner — Cloudflare Workers

`serverless/wrangler.toml` runs a cron every 3 minutes. Required secrets:

```bash
cd serverless
npx wrangler secret put ORACLE_KEYPAIR      # JSON array from ~/.config/solana/mainnet-keeper.json
npx wrangler secret put CRANK_AUTH_TOKEN    # POST /crank fails closed (503) without this
npx wrangler secret put RPC_URL             # Helius mainnet endpoint
npx wrangler deploy
```

`RPC_URL` used to sit in the committed `[vars]` block with an API key in it. It is now read
from the environment; the previously committed value is preserved as a comment in
`wrangler.toml` and **should be rotated** (see `serverless/README.md`).

Health: `GET /health` returns both feeds' ages, the cluster it is actually talking to, and
logs a `STALE PRICE FEEDS` alert once any feed passes 540 s. It returns **200** when healthy
and **503** when not, so an uptime monitor on that URL pages you.

### 2.2 Failover runner — GitHub Actions

`.github/workflows/keeper.yml` runs every 6 minutes. Earlier revisions pinned a **devnet** RPC
while `PROGRAM_ID` fell through to the mainnet default, so this job had never cranked a
mainnet feed. It now sets `NETWORK=mainnet-beta`, `PROGRAM_ID` explicitly, and verifies the
endpoint's genesis hash in-job before signing.

Add repository secret **`KEEPER_KEYPAIR_JSON`** (Settings → Secrets and variables → Actions)
containing the JSON array from `~/.config/solana/mainnet-keeper.json`, plus optional
**`HELIUS_RPC_URL`**. The job fails with a clear message if the keypair secret is missing.

### 2.3 Manual crank / status

```bash
# Read-only status
cd serverless
NETWORK=mainnet-beta RPC_URL=https://api.mainnet-beta.solana.com node src/cli.mjs --status

# Crank with the keeper key. Uses the SAME code the Cloudflare Worker runs,
# and exits non-zero if either feed fails or cannot be verified.
cd /home/rootkit/lend/serverless
ORACLE_KEY=~/.config/solana/mainnet-keeper.json \
  NETWORK=mainnet-beta node src/cli.mjs
```

The runner logs each feed's staleness age before the update, verifies the feed actually
advanced afterwards, and exits non-zero if any feed did not update.

---

## 3. Upgrading the program

`mobile/scripts/deploy-mainnet.mjs` refuses to touch an existing program unless you pass
`--upgrade`; it no longer prints "COMPLETE" while silently skipping the deploy.

```bash
cd /home/rootkit/lend
export DEPLOYER_KEY=~/.config/solana/mainnet-deployer.json
export PROGRAM_KEYPAIR=~/.config/solana/clock-lend-program.json

# One explicit cluster drives both web3 and the solana CLI; genesis is asserted.
node mobile/scripts/deploy-mainnet.mjs --upgrade --cluster mainnet-beta
```

What it does:

1. Runs `cargo build-sbf` and hard-fails if the ELF is older than `program/src` or `Cargo.lock`.
2. Asserts `getGenesisHash` matches `--cluster`, and that the endpoint and CLI agree.
3. If the new ELF is larger than the current allocation, runs `solana program extend` in
   ≤10,240-byte steps (agave caps a single extend at that).
4. `solana program write-buffer` → `solana program deploy --program-id … --buffer …`.

   Known CLI quirk: plain `solana program deploy <file>` can appear to no-op against an
   existing upgradeable program. The write-buffer + `--buffer` form is the reliable path.
5. **Verifies by hashing.** It fetches ProgramData, hashes `data[45 : 45 + local ELF size]`,
   and aborts if it does not equal `sha256sum` of the local `.so`. A zero exit code from the
   CLI is not treated as proof of deployment.

An upgrade changes the bytecode hash. After any upgrade, update the recorded sha256 in this
runbook and in `site/index.html` / `site/audit-report.html`.

---

## 4. Treasury operations

The treasury PDA `5buCUcCHHDCzQpanMKCK8uruErL5D2UzSFVrbtPrKV7y` has **no account on chain**.
Only its USDC ATA exists, with a 0 balance. Fee-bearing instructions that require the treasury
account will fail until it is initialized, and **no protocol fee has ever been collected**.

All money scripts now verify the cluster via `getGenesisHash` and require `--yes` to send on
mainnet (`--dry-run` builds and simulates without sending).

```bash
# Inspect (read-only)
node scripts/burn-skr.mjs --status --network mainnet
node scripts/withdraw-treasury.mjs --cluster mainnet-beta --status

# Withdraw profit (mainnet requires an explicit --dest; there is no default destination)
node scripts/withdraw-treasury.mjs --cluster mainnet-beta \
  --amount 50 --token usdc --dest <COLD_WALLET> --dry-run
node scripts/withdraw-treasury.mjs --cluster mainnet-beta \
  --amount 50 --token usdc --dest <COLD_WALLET> --yes

# SKR buyback & burn (burns only the measured delta acquired by the swap)
node scripts/burn-skr.mjs --buy --token usdc --amount 100 --network mainnet --dry-run
node scripts/burn-skr.mjs --buy --token usdc --amount 100 --network mainnet --yes
```

The **30% buyback & burn is a manual, team-run process** (`scripts/burn-skr.mjs`), not an
autonomous on-chain mechanism. No buyback has been executed to date.

### 4.1 Rotating the oracle authority

```bash
node scripts/rotate-oracle.mjs --cluster mainnet-beta \
  --new-oracle <PUBKEY_OR_KEYPAIR_PATH> --dry-run
```

`--cluster` and `--new-oracle` are both mandatory. The script has **no default new-oracle
key** (it previously fell back to `~/.config/solana/clocklend-oracle.json`, which would
silently hand price control to whatever key sat at that path), verifies the endpoint genesis,
checks the signer is the on-chain upgrade authority, prints the old → new authority diff, and
requires `--yes` on mainnet.

---

## 5. Open issues (as of 2026-09-29)

| # | Issue | Impact |
|---|---|---|
| 1 | Keeper not running reliably; feeds observed ~81 min stale on 2026-09-29 (only 4 writes ever, hours apart) | Borrow/liquidation paths reading feeds revert |
| 2 | ~~Round-14 POC-1/2/3 fixes not redeployed~~ **resolved** — redeployed; on-chain bytecode matches this repo (verified 2026-09-29) | — |
| 3 | Treasury PDA never initialized | No fees collected; fee paths fail |
| 4 | Upgrade authority is a single key, not a multisig, not timelocked | Key compromise = program replacement |
| 5 | SKR yield vault initialized but never funded; the one pool holds $50 USDC of team liquidity and has originated zero loans | Yield feature is inert in practice |
| 6 | No third-party audit has been performed | Internal, AI-assisted rounds only |
| 7 | Committed Helius RPC key in `serverless/wrangler.toml` (now removed from the text, still in git history) | **Must be rotated with the provider** — deleting the text does not revoke it |
| 8 | The live pool was created with `max_ltv_bps = 9000`, before the round-14 cap, and there is no instruction to update pool parameters | A 90% LTV loan is not protected by the round-14 7000 bps reasoning; drain and recreate the pool, or add an update instruction |
| 9 | ~~AWS Lambda keeper auth bypasses~~ **resolved by removal.** The handler was a third deployment of the same `crankOracles` code carrying a third copy of the oracle key. Cloudflare is now the only scheduled runner | If you deploy from a machine that still has the old `lambda.ts`, it is stale — the file is gone |
| 10 | Cloudflare `/health` returned `rpcUrl` unredacted and echoed raw `err.message` | Fixed in `serverless/src/index.ts` (`redactUrl`, `safeErrorMessage`); redeploy the worker |
| 11 | ~~Round-15 program hardening committed but NOT deployed~~ **resolved** — deployed and bytecode-verified on Mainnet-beta on 2026-10-02 (tx `2EvscADU7AtmGBpf5qLC1G8aNoj8RzoEcWJPcqpbdoruMixLSAfDV2kwR3dDiE5dNXPYwADUkqmQNoMum7uazZok`) | — |
| 12 | Pool LTV is capped at 7000 on the P2P path as well, so the live pool's 9000 is now the only way to borrow above 70% | Intentional; drain/recreate the pool as in item 8 |

---

## 6. Risks accepted (documented design decisions)

| Risk | Mitigation |
|---|---|
| Single admin/oracle key can move all global prices | Keeper uses a **separate** `oracle_authority` (`HtiDpTk…`), rotatable via `InitializeAdmin` with the upgrade-authority key; keep the upgrade key offline |
| Price manipulation / stale price | Keeper cadence < 10 min; 600 s fail-closed bound; bounded price (≤ $1M/token) and decimals (1–18) |
| P2P funders must verify the offer's on-chain `liquidity_mint` | Show the mint in the UI before funding |
| Pool authority keys are irrevocable (no rotation instruction) | Deploy desks with durable keys |
| No LP shares — only the pool authority can deposit/withdraw | Documented as single-owner desks (product decision) |
| Upgrade authority = deployer key | Store offline; rotate via `set-upgrade-authority` if needed — `InitializeAdmin` stays valid (ProgramData-derived) |
