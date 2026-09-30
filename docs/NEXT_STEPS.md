# Next steps — ordered execution plan

> **Read §0 first.** The order below is not arbitrary; two of these steps will corrupt
> something if done out of sequence.

## 0. Two things that bite if you get the order wrong

**The history rewrite makes every other clone stale.** Once it is pushed, the deploy
machine still has the *old* history — the one containing the Helius key. If you commit or push
from there before resyncing, you will reintroduce the key into a "cleaned" repo and the purge
becomes pointless. Resync it (§3.1) before doing anything else on that machine.

**Redeploy before migrating to a multisig.** Once the upgrade authority is a Squads vault,
every future upgrade costs a proposal plus the full timelock. That is the point of doing it —
but it also means the round-15 fixes should ship *first*, while the authority is still a
plain keypair. Migrating first makes the redeploy a 24-hour process for no benefit.

---

## 1. Land the work (this machine) — ✅ DONE 2026-09-30

Committed as five commits (`bcc1dad`, `39744de`, `51d25a8`, `9afe419`, `d1e8247`).
Pre-commit checks that were run: `node mobile/scripts/keeper.test.mjs` → 12/12;
`cargo test --release` → 107 passed / 0 failed.

## 2. Push the rewritten history (this machine) — ✅ DONE

`git push --force origin master` succeeded; the remote `master` is now `d1e8247` and a fresh
clone of the public repo confirms **0 commits contain the Helius key**.

`main` was **not** pushed and does not need to be: it is a stub branch from 18 Sep containing
zero commits with the key — it predates the mainnet bootstrap entirely. `master` was the only
branch carrying it. Local `main` and `origin/main` now differ in SHA (the rewrite touched the
graph) but are content-identical.

Two follow-ups from this step:
- Your remote URL still says `Clock-It`; the repo is now `ClockLend`. Pushes work via redirect.
- `main` is still the GitHub **default** branch, so visitors land on a 1-line stub. Consider
  making `master` the default.

**Then rotate the Helius key regardless.** GitHub keeps unreachable objects reachable by SHA
for a while after a force-push, and the repository is **public**, so assume
the old key has already been scraped. Removing it from history limits future exposure; only
revoking it at Helius ends it. Rotate at provider → put the new value in `.env` locally and
in the Cloudflare secret — **never back into a tracked file**.

Also: your public default branch is `main`, which is GitHub's 1-line stub README. All the
real work is on `master`. Consider making `master` the default.

## 3. Redeploy round-15 (deploy machine)

### 3.0 What must exist on that machine first

Several things this repo needs are **not in git**, so a fresh clone does not have them.
Check all of these before starting:

| Needed | Why | If missing |
| :--- | :--- | :--- |
| `.env` at the repo root | `deploy-mainnet.mjs` calls `loadEnv()`. **Gitignored — it does not travel with a clone.** | Falls back to the public mainnet RPC, which is rate-limited; the upgrade can time out mid-flight while still having spent lamports |
| `mobile/node_modules` | The script imports `@solana/web3.js`. Also gitignored. | `npm install` in `mobile/` |
| `solana` CLI + `cargo-build-sbf` | Build and deploy | Install the Agave toolchain. **Record `solana --version`** — hash reproduction depends on it |
| `~/.config/solana/mainnet-deployer.json` (or `DEPLOYER_KEY`) | Upgrade authority | Cannot upgrade at all |
| `~/.config/solana/clock-lend-program.json` (or `PROGRAM_KEYPAIR`) | Program identity | Deploy aborts in preflight |
| `~/.config/solana/mainnet-buffer.json` (or `BUFFER_KEYPAIR`) | Write-buffer step | **Confirm you have this one — it is easy to forget** and the failure is late |
| Node 18+ | Scripts | — |

### 3.1 Resync first — mandatory

```bash
git fetch origin
git log --oneline origin/master | head    # confirm the rewritten SHAs (HEAD will not be d7ca71a)
git reset --hard origin/master            # discard the old history
```
Do **not** merge or pull; the histories are unrelated after the rewrite. Pushing anything
from a stale checkout reintroduces the Helius key into a "cleaned" repo.

### 3.2 ⚠️ Fund the deployer wallet — the upgrade will otherwise fail

**Measured 2026-09-30: the deployer holds `0.1647 SOL`. An upgrade needs `1.8546 SOL` of
rent-exempt buffer for the 364,960-byte ELF.**

```bash
solana balance 8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds --url <MAINNET_RPC>   # 0.1647 SOL today
# buffer rent needed: 1.8546 SOL (refunded when the buffer closes, but required up front)
```

Send **at least ~2 SOL** to the deployer wallet before attempting the upgrade. The buffer
rent is refunded once the deploy completes, so this is temporary liquidity, not a spend —
but without it `write-buffer` fails and you have burned a trip.

### 3.3 Build, verify, deploy

```bash
cd program && cargo-build-sbf --sbf-out-dir target/deploy
sha256sum target/deploy/clock_lend.so
# Reference build produced on 2026-09-29 with this repo's toolchain:
#   31b4c68307359583c45173330354794d5e08df2e911b60808cc1677f533c1606  (364,960 B)
# A different toolchain may legitimately produce a different hash — record YOURS.
```

```bash
cd .. && node mobile/scripts/deploy-mainnet.mjs --upgrade --cluster mainnet-beta
```
Do **not** pass `--create-pool` (pool id 1 already exists and would collide) or
`--rotate-oracle` unless you intend it. The script verifies the cluster genesis before
signing and prints a `--dry-run`-style simulation; read its output rather than the exit code
alone.

### 3.4 Re-verify — and update the record

This is the step that closes the loop on the bug this audit opened with. The moment you
deploy, every hash recorded in the repo becomes stale.

```bash
curl -s https://api.mainnet-beta.solana.com -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["9ikmDTbbRhtgYKjRhcnzCK9RpPWQ8uTYUeNJ16kWMLSG",{"encoding":"base64"}]}' \
| python3 -c "
import sys,json,base64,hashlib,os
d=base64.b64decode(json.load(sys.stdin)['result']['value']['data'][0])
n=os.path.getsize('program/target/deploy/clock_lend.so')
print('allocated :', len(d))
print('on-chain  :', hashlib.sha256(d[45:45+n]).hexdigest())
"
# Must equal: sha256sum program/target/deploy/clock_lend.so
```

Then update **all** of these, which currently describe the round-14 deployment:

- `README.md` — the Program block (hash, allocated/ELF sizes, deploy slot, and the
  "source has moved ahead of the deployment" warning, which should be removed)
- `docs/MAINNET_RUNBOOK.md` §0 table and the §1.1 `# expect` comment
- `site/audit-report.html`
- README open item 7 / runbook item 11 ("round-15 committed but not deployed") — mark resolved

## 3b. Go-live gate — do not open to real money until all six pass

A redeploy that returns exit 0 proves the bytecode changed. It does not prove the protocol
works. Work through these in order; each one exercises something the previous cannot.

| # | Check | How to prove it | Why it can fail silently |
| :--- | :--- | :--- | :--- |
| 1 | **On-chain bytecode verified** | §3.4 recipe: on-chain slice hash == `sha256sum` of your build; then update the four recorded locations | The whole point of the exercise; a stale record is what this audit opened with |
| 2 | **Feeds fresh** | `curl <worker>/health \| jq '{oldestFeedAgeSeconds, healthy}'` → `healthy: true`, age well under 600 | A keeper that is not running reports nothing at all. This is live right now |
| 3 | **Keeper monitored** | An external monitor on `/health`, alerting on anything but HTTP 200 | **Without this you are relying on a silent component to report its own silence** — exactly how a 9-hour outage went unnoticed |
| 4 | **Borrow path actually works** | The smoke test below | Borrows revert with `StaleOraclePrice` if feeds lapsed, and with `InvalidTreasuryAccount` if the treasury ATA is missing. Both produce a UI that looks fine |
| 5 | **90% LTV pool neutralised** | §4 | It is the only pool that can lend above 70%, with no price-based liquidation. A live pool is a live liability |
| 6 | **Keys accounted for** | Confirm which key is admin, which is oracle authority, and that the upgrade authority is the one you think | `AdminConfig.admin` and the upgrade authority are **both** `8YvdDpW…` today; oracle is separate |

### The smoke test (gate 4)

Do this with deliberately small amounts on mainnet, as the pool authority:

1. Create a **new** desk (LTV ≤ 7000 bps). Proves `InitializePool` accepts your parameters
   and that the round-15 cap does not block legitimate use.
2. `DepositLiquidity` a small amount — enough to cover the borrow plus fees.
3. Borrow a small amount against SOL or SKR collateral with a **short duration**.
   This is the single most important step: it exercises the oracle read, the collateral
   escrow, the origination-fee split, and the treasury ATA in one transaction.
4. **Repay in full** (`principal + interest`, exactly — there is no partial repayment).
   Proves the interest take-rate leg and the collateral return.
5. Confirm the collateral is back in your wallet and the loan reads `Repaid`.

If step 3 reverts, the error code identifies the cause (codes are the `ClockLendError`
discriminants in `program/src/error.rs`, surfaced as `Custom(n)`):

| Code | Variant | Means |
| :--- | :--- | :--- |
| 29 | `StaleOraclePrice` | The feed is older than 600 s — the keeper is not running |
| 24 | `InvalidTreasuryAccount` | The treasury token account for that mint is missing |
| 28 | `InvalidOracleAccount` | No usable feed was supplied or it is misconfigured |
| 10 | `InvalidCollateralRatio` | LTV above the 7000 bps cap, or a bad `max_ltv_bps` at pool init |
| 11 | `InsufficientLiquidity` | The pool vault cannot cover the borrow |

**Known prerequisite:** the treasury PDA has no account on chain, but its **USDC** ATA
(`9UozceLNGCansqNeDcGFvirwLrnCyrTQFRSKGvmfnG63`) exists, so USDC-pool borrows can pay fees
today. A **WSOL** pool would need a WSOL treasury ATA created first, or every borrow reverts.

## 4. Neutralise the 90% LTV pool

It cannot be reconfigured; there is no update instruction. Either drain and recreate it, or
add an update instruction in a later upgrade. Until then it is the only way to borrow above
70%, on a pool with no price-based liquidation. See README open item 2.

## 5. Bring the keeper up

Follow `docs/KEEPER_LIVENESS.md` §4 in order. The short version:

1. Deploy the Cloudflare Worker and confirm the `*/3` cron is attached.
2. **Add an external uptime monitor on `/health`** (503 when stale). Without it you are
   relying on a silent component to report its own silence — which is exactly how the
   nine-hour outage happened.
3. Crank once manually and confirm both feeds advance.
4. Set `KEEPER_KEYPAIR_JSON` in GitHub Actions and re-enable the workflow.
5. **The AWS Lambda has been removed** — Cloudflare is now the only scheduled runner,
   because the Lambda was a third deployment of the same code carrying a third copy of the
   oracle key. If a Lambda is still deployed in your AWS account, **delete the function and
   its `ORACLE_KEYPAIR` environment variable**; revoking that key copy is the point. If you
   want a second runner, a `systemd` timer on an always-on host beats GitHub Actions, whose
   scheduled workflows auto-disable after 60 days of repo inactivity.

Not implemented, and worth knowing: there is still **no rate limiting** on `/crank` or
`/health`. `/health` makes RPC calls per request, so it can be spammed to exhaust the Helius
quota the cron depends on. That is a liveness lever an attacker can pull, and it needs a
decision about where to enforce the limit (Cloudflare rules vs. in-worker).

## 6. Migrate to a multisig

`docs/MULTISIG_MIGRATION.md`. Recommended: Squads v4, **2-of-3, 24 h timelock**; upgrade
authority and `AdminConfig.admin` → the vault; `oracle_authority` stays hot (a multisig
cannot sign an unattended 3-minute crank). Read §0 of that document before its own steps —
it corrects several assumptions, including that oracle rotation is an *upgrade-authority*
action and therefore also costs a proposal plus the timelock.

## 7. Human review

- **Legal**: the LTV/slash/fee language in `site/terms.html` and `site/legal.html` was
  corrected for factual accuracy, not reviewed for legal exposure.
- **Bump the "Last Updated" dates** on those pages if you consider the corrections material.
- **A real third-party audit** before meaningful money is at stake. Fourteen internal
  AI-assisted rounds — including the one that produced this document — are not an audit.

## 8. Known-open, deliberately not fixed

- The permissionless borrow path can still be used by a sole staker to capture the parked
  yield backlog *at the moment the authority calls `DepositSkrYield`*. Parking removed the
  attacker's control of the timing; it did not remove the advantage of being the only
  staker. A time-based drip needs a `SkrYieldVault` layout change and a migration.
- A loan past due whose grace period was never triggered stays `Active` indefinitely: it can
  always be repaid, but it can never be liquidated.
- `has_custom_oracle` is a one-way flag; a pool that opts in can brick its own borrow path
  until it also creates a pool-scoped liquidity feed.
