# ClockLend — Mainnet Runbook

Status: **deployed and live on Solana Mainnet-beta.** Every address and hash in this
document was read from mainnet-beta RPC and can be re-verified with the commands given.
Where something is *not* done, it says so explicitly.

> **Last verified on chain: 2026-10-09.** The deployed bytecode was re-verified against a
> local `cargo-build-sbf` build and matched over all **374,168** non-padding bytes
> (sha256 `cac19e08…`).
>
> This **supersedes the round-15 hash** recorded here on 2026-10-02
> (`6a3375bf…`, 371,632 bytes). The audit remediation was redeployed after round 15, which
> changed both the bytecode and its length. If you are holding a copy of this runbook that
> quotes `6a3375bf`, it predates that redeploy.

---

## 0. Live deployment facts (verified)

| Field | Value |
|---|---|
| Cluster | mainnet-beta, genesis `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` |
| Program ID | `4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7` |
| ProgramData | `9ikmDTbbRhtgYKjRhcnzCK9RpPWQ8uTYUeNJ16kWMLSG` |
| Allocated bytes | `377,997` (ELF is `374,168`; the remainder is retained zero padding) |
| Upgrade authority | `8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds` |
| Bytecode sha256 | `cac19e085e44f79f42c43b2cd511ed3c98a6db961beefde8d895ced9e212283a` |
| Deployed at slot | `454108434` |
| AdminConfig PDA | `7tCidaB2vu5N8KfKJ2Mqfm5dxbkvSqqvxHqkznYveroi` (`CLK_ADMN`, 73 B) |
| `admin` | `8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds` |
| `oracle_authority` | `HtiDpTkcWDDaQeRLSBvYDdw2sRJb5VvkD7EMvr5JWVzJ` |
| SOL feed PDA | `49b74tSY5EgaTHUA3GZLJFJ3piwfkNUgXz9itachPyyH` (`CLK_FEED`, 98 B) |
| SKR feed PDA | `Fpcvf78bzAkdeKzvB6ZqgudzmWWvs4detDpEkmz1W6X8` (`CLK_FEED`, 98 B) |
| Lending pool (Active) | `DqjjKqmntorNQYa9dJ6forBxZFPup5TmZ2ZpMBy4EZpF` (`CLK_POOL`, ID #2, 50 USDC, 65% LTV, 8% APR) |
| Lending pool (Legacy) | `4YC4rCNXva8ty6f1pKRC2NX7e5kufqowBYJDCMor12Wu` (`CLK_POOL`, ID #1, drained to 0 USDC) |
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
cd ~/ClockLend
sha256sum program/target/deploy/clock_lend.so   # expect 374,168 bytes
# then fetch ProgramData, decode base64, and hash data[45 : 45+local_elf_size]
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
# expect 377997 / cac19e085e44f79f42c43b2cd511ed3c98a6db961beefde8d895ced9e212283a
```

Any bytes past `45 + local_elf_size` are historical zero padding and must **not** be hashed.

**Do not hard-code the ELF length.** It changes on every rebuild, and a stale length silently
produces a wrong hash that looks authoritative — which is how this document previously carried
`6a3375bf…` and a `357472`-byte slice long after both had stopped being true. Read the size
from the local `.so` every time, as the one-liner above does.

---

## 2. Oracle keeper (price feeds)

ClockLend is **admin-feed-only** (Pyth was removed). The feeds just described are the sole
price source, and the program caps admin-feed pricing at **600 s**
(`processor.rs`: `feed.max_staleness_seconds.min(ADMIN_FEED_MAX_PRICE_AGE_SECS)`). The stored
`max_staleness_seconds` on chain is **3600**, retained for monitoring only — the effective
bound is 600 s. Past that, borrow and liquidation paths that read a feed revert with
`StaleOraclePrice`.

> **Current state (2026-10-09): running, confirmed on chain.** Both feeds observed
> updating on a 3-minute cadence across four consecutive timer runs, ages cycling
> 8–162 s against the 600 s bound.

### 2.1 The runner — one DigitalOcean droplet, and that is deliberate

**There is exactly one keeper runner.** The Cloudflare cron and the GitHub Actions schedule
are both disabled *on purpose* — do not re-enable them, and do not read their absence as a
misconfiguration. A single runner means there is no second opinion: if this box stops, the
protocol halts silently and nothing else notices.

The runner is a systemd timer on the droplet:

| | |
|---|---|
| Unit | `/etc/systemd/system/clocklend-keeper.timer` → `clocklend-keeper.service` |
| Cadence | every 3 minutes, `Type=oneshot` |
| Working dir | `/root/ClockLend/serverless` |
| Entrypoint | `/usr/bin/node src/cli.mjs` |

The unit's environment, and why each line is shaped the way it is:

```ini
Environment="NETWORK=mainnet-beta"
Environment="RPC_URL=<a keyed endpoint with headroom>"
Environment="ORACLE_KEY=/root/.config/solana/mainnet-keeper.json"
```

- **`ORACLE_KEY` is a path, not the key.** `cli.mjs` reads the file and accepts either
  `ORACLE_KEY` (path) or `ORACLE_KEYPAIR` (the JSON itself). Use the path form. The keypair
  was previously inlined as `Environment="ORACLE_KEYPAIR=[229,…]"`, which put the oracle
  authority's private key in a world-readable unit file and into `systemctl show` output.
  Anything that prints the unit environment leaked it.
- **`RPC_URL` must be a paid endpoint.** A shared public endpoint is fine for a rescue crank
  and not for a 3-minute production cron.

### 2.2 When it dies — and it will

**Step 1: read the journal, not your assumptions.** The failure mode is usually *not* a dead
timer:

```bash
systemctl list-timers --all | grep clocklend-keeper
journalctl -u clocklend-keeper.service -n 80 --no-pager
```

**Step 2: crank manually**, which separates "the runner is broken" from "the RPC is broken":

```bash
cd ~/ClockLend/serverless
ORACLE_KEY="$HOME/.config/solana/mainnet-keeper.json" \
NETWORK=mainnet-beta \
RPC_URL=https://solana-rpc.publicnode.com \
node src/cli.mjs
```

**Step 3: confirm on chain**, not from the exit code:

```bash
cd ~/ClockLend/serverless
NETWORK=mainnet-beta RPC_URL=https://solana-rpc.publicnode.com node src/cli.mjs --status
```

This is the real lesson from the 2026-10-08 outage, and it cost 23.5 hours. The timer was
firing normally every 3 minutes; every run was dying on `429 max usage reached` from an
exhausted Helius key. **A timer that fires is not a keeper that works** — check
`oldestFeedAgeSeconds`, which is the only number that means anything.

Two traps worth knowing, both of which produce a misleading signal:

- **`Execution Failed: … block height exceeded` does not mean the crank failed.** On a slow
  or load-balanced RPC, `getLatestBlockhash` and `getBlockHeight` can be answered by different
  backends, so the expiry check trips immediately while the transaction lands fine. Confirm the
  signature with `getSignatureStatuses` before believing it. Fixed in `380146a`; a box running
  older code still reports these as failures.
- **A missing account is not an empty one.** A 429 during the read-back must never be reported
  as a healthy feed. `verifyFeedsAdvanced` enforces this and the tests in
  `serverless/test/` pin it.

### 2.3 Monitoring — required, not optional

With one runner there is no `/health` endpoint anywhere: it lived on the unused Cloudflare
Worker. Nothing outside the droplet knows whether the keeper is alive.

Use a **dead-man's switch** (healthchecks.io, Cronitor, Dead Man's Snitch) — the droplet
reports success and the service alerts when the reports *stop*. That catches what a normal
monitor cannot: box powered off, timer disabled, service failing every run.

```bash
systemctl edit clocklend-keeper.service
```

```ini
[Service]
ExecStartPost=/usr/bin/curl -fsS -m 10 --retry 3 -o /dev/null https://hc-ping.com/YOUR-UUID
```

Period 3 min, grace ~12 min. `ExecStartPost` fires only on a zero exit, so **the crank must
exit honestly first** — with pre-`380146a` code every successful run exits 1 and the pings
never arrive. Grace of 12 minutes tolerates ~3 missed cranks before paging, which is the
difference between finding out in 15 minutes and finding out the next day.

### 2.4 What the exit code means

`src/cli.mjs` is the only keeper implementation — the same `crankOracles` the retired
Cloudflare Worker ran. There is no second copy to drift out of sync.

It verifies the endpoint's genesis hash before signing, logs each feed's staleness before the
update, then **reads both feeds back** and requires a strict increase over the pre-crank
snapshot. Exit `0` means both feeds were *observed* to advance — not merely that a transaction
confirmed.

That distinction is the whole point. `confirmTransaction` proves a transaction finalised; it
says nothing about whether the accounts reached the intended state, and says nothing at all if
the read-back is what failed. Treat the read-back as authoritative, never the confirmation.

---

## 3. Upgrading the program

`mobile/scripts/deploy-mainnet.mjs` refuses to touch an existing program unless you pass
`--upgrade`; it no longer prints "COMPLETE" while silently skipping the deploy.

```bash
cd ~/ClockLend
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

## 5. Open issues (as of 2026-10-09)

| # | Issue | Impact |
|---|---|---|
| 1 | ~~Keeper down~~ **recurred, resolved 2026-10-09.** Both feeds went **23.5 h stale** (last write 2026-10-08 11:18 UTC). The systemd timer was firing every 3 minutes the whole time; every run died on `429 max usage reached` from an exhausted Helius key in the unit's `RPC_URL`. Pointed at a live endpoint, the 3-minute cadence resumed and was confirmed across four consecutive timer runs | Borrow and P2P-offer paths revert with `StaleOraclePrice`; `ClaimDefault` cannot price. **A firing timer is not a working keeper** — check `oldestFeedAgeSeconds`, never the unit's status |
| 2 | ~~Round-14 POC-1/2/3 fixes not redeployed~~ **resolved** — redeployed; on-chain bytecode matches this repo (verified 2026-09-29) | — |
| 3 | Treasury PDA never initialized | No fees collected; fee paths fail |
| 4 | Upgrade authority is a single key, not a multisig, not timelocked | Key compromise = program replacement |
| 5 | SKR yield vault initialized but never funded; the one pool holds $50 USDC of team liquidity and has originated zero loans | Yield feature is inert in practice |
| 6 | No third-party audit has been performed | Internal review rounds only. An independent audit is the next milestone, not a permanent state |
| 7 | Helius RPC key: once committed to `serverless/wrangler.toml` (removed from the text, still in git history) **and** inlined in the droplet's systemd unit. **That key is now exhausted** — it returns `429 max usage reached` on both `HELIUS_RPC_URL` and the gatekeeper endpoint, and it caused item 1 | **Rotate it with the provider.** Deleting the text revokes nothing. The droplet no longer uses it |
| 8 | ~~The live pool was created with max_ltv_bps = 9000~~ **resolved** — drained legacy pool #1 (tx `4dH2PXDjcFaNdDSvm6MC4DT6GC5iEdkAnSA9JuB6sWYS8MmefY3M3ZZPpMhiWdMXrNzuunZYzJ19jHVLD8aYRhZH`) and created new production pool #2 with 65% LTV (6500 bps) and 8.00% APR funded with 50 USDC (tx `24iWRBUXMufkewT2DWvH6uCo8zw96hb93MzzCcUvPXWMgsXmhfbVZdNcUxvxy1QbH31fAagZNCtiBYGyenynJHRf`) | — |
| 9 | ~~AWS Lambda keeper auth bypasses~~ **resolved by removal.** The handler was a third deployment of the same `crankOracles` code carrying a third copy of the oracle key. **The droplet systemd timer is now the only runner** (see §2.1) | If you deploy from a machine that still has the old `lambda.ts`, it is stale — the file is gone |
| 10 | Cloudflare `/health` returned `rpcUrl` unredacted and echoed raw `err.message` | Fixed in `serverless/src/index.ts` (`redactUrl`, `safeErrorMessage`); redeploy the worker |
| 11 | ~~Round-15 program hardening committed but NOT deployed~~ **resolved** — deployed and bytecode-verified on Mainnet-beta on 2026-10-02 (tx `2EvscADU7AtmGBpf5qLC1G8aNoj8RzoEcWJPcqpbdoruMixLSAfDV2kwR3dDiE5dNXPYwADUkqmQNoMum7uazZok`) | — |
| 12 | LTV is capped at 7000 everywhere, on both the pool and P2P paths | Intentional. The live pool is seeded at 6500 (item 8), so nothing currently sits near the cap |
| 13 | **One keeper runner, no monitoring.** Cloudflare and GitHub Actions are disabled by choice, so a single droplet is the only thing keeping the feeds fresh | Nothing outside that box can detect a dead keeper — item 1 was silent for 23.5 h. The mitigation is a dead-man's switch (§2.3) and it is **not yet in place** |
| 14 | The droplet cranks through a shared public endpoint | Adequate for a rescue crank, not for a 3-minute production cron. Will rate-limit eventually, and will present exactly as item 1 did. Needs a keyed endpoint with headroom |
| 15 | ~~Oracle authority private key inlined in the systemd unit as `Environment="ORACLE_KEYPAIR=[…]"`~~ **resolved 2026-10-09** — the unit passes `ORACLE_KEY=<path>` to a mode-600 file, so the key is no longer in the unit environment | Historical exposure: reading the unit file or running `systemctl show` disclosed it. **Not rotated** — assessed as low risk because only part of the seed was ever disclosed |
| 16 | The mobile client treated a 429 as fatal and never rotated RPC endpoints, so a rate-limited endpoint made repayment impossible | Fixed in `370bf4b`. Blockhash, block height and confirmation now fail over; `isEndpointFailure` keeps genuine transaction errors from being retried on every remaining node |

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
| **Single keeper runner** — one droplet is the only thing keeping prices fresh, and its absence halts the protocol | Accepted deliberately: the Cloudflare and GitHub runners are disabled by choice. The compensating control is a dead-man's switch (§2.3), which is **not yet in place**. Until it is, a dead keeper is indistinguishable from a healthy one until someone tries to borrow |
