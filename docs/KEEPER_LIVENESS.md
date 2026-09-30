# Keeper liveness — root cause, fixes, and how to stop it recurring

> **Status as of 2026-09-29: the keeper is not running.** Observed on-chain: only **four**
> successful price-feed writes exist, spaced ~1.4 h to ~9.9 h apart — not the 3-minute
> cadence the configuration asks for — and the SOL feed was last written ~9 hours ago
> against a program bound of **600 seconds**. Every borrow and P2P offer creation therefore
> reverts with `StaleOraclePrice`. This is not a program bug: it is the design working as
> intended against a keeper that is not running.

## 1. Why this is the binding constraint on the whole product

ClockLend is **admin-feed-only** (Pyth was deliberately removed in round 11). The program
refuses to price any loan from a feed older than `ADMIN_FEED_MAX_PRICE_AGE_SECS = 600`
(10 minutes). There is no on-chain fallback and no degraded mode.

Consequently: **if the keeper stops, the protocol stops.** Everything else — the app, the
pool, the P2P deck — stays up and looks healthy while every money path fails. That failure
mode is invisible unless something is watching for it, which is exactly how the current
outage went unnoticed.

## 2. Two ways the keeper was lying about success

Both are fixed in `mobile/scripts/keeper.mjs`; neither fix is deployed anywhere yet.

**a) "Couldn't verify" was reported as "succeeded".** After sending the update, the keeper
read the feed back. If that read *failed* (RPC 429, timeout), `readFeedState` returned
`{exists:false}`, which fell through to the `else` branch — printing a success line and
**not** adding to `failures`. The run then exited `0`. A keeper that cannot reach the RPC
during verification would report a clean run forever.

Now: the post-check **retries** (3 attempts, backoff), and if it still cannot confirm the
write it reports `UNVERIFIED`, records a failure, and exits non-zero. Absence of evidence
is no longer treated as evidence of a landed update.

The rule is a pure function, `classifyPostUpdate`, so it is testable without a network:

```bash
node mobile/scripts/keeper.test.mjs   # 12 cases, exits non-zero on failure
```

It pins the regression directly: every unconfirmable read (null result, missing account,
`readError`, undecodable, null age) must classify as `unverified` and never as `ok`.
Note there is no test framework in `mobile/`, so this is a plain Node script — run it
directly. It needs `@solana/web3.js` present in `mobile/node_modules`.

**b) A missing SKR price was logged and ignored.** If Jupiter (and the CoinGecko fallback)
had no SKR price, the SKR target was dropped from the list with a console line and the run
still exited `0`. The SKR feed could go stale indefinitely while every run "succeeded".

Now: on mainnet, no SKR price source is a recorded failure.

**c) The primary runner had no verification at all.** The Cloudflare Worker is the
*primary* keeper — `.github/workflows/keeper.yml` runs `serverless/src/cli.mjs`, which calls
`crankOracles` in `serverless/src/index.ts`. That path trusts `confirmTransaction` and never
reads the feeds back. A finalised transaction is not proof the accounts reached the intended
state, and it says nothing if the read-back is the thing that failed. It now reads both feeds
back and throws if either `last_updated_at` did not advance past the start of the crank —
retrying briefly first, and treating an unreadable feed as unconfirmed.

Note these are two separate runners with two separate code paths: the fixes to
`mobile/scripts/keeper.mjs` do **not** cover the Worker, and vice versa. Both now fail closed.

## 3. The structural reason it died silently

There are two runners configured, and **both fail in ways that produce no alert**:

| Runner | Config | How it fails silently |
| :--- | :--- | :--- |
| **Cloudflare Worker** (`serverless/`) | cron `*/3 * * * *` | If it was never deployed, or the cron trigger isn't attached, nothing runs and nothing reports. The worker only surfaces staleness when someone *requests* `/health`. |
| **GitHub Actions** (`keeper.yml`) | cron `*/6 * * * *` | GitHub **disables scheduled workflows on a repository with no activity for 60 days**, and scheduled runs are commonly delayed well past their slot under load. A delayed `*/6` run has little margin against a 600 s bound. |

A failing run that *does* happen will email the repo owner. A runner that never fires at all
emits nothing — which is what happened here.

## 4. Fix checklist

Do these in order. Steps 1–3 are what actually restore liveness.

1. **Confirm the Cloudflare Worker is deployed and its cron is attached.**
   ```bash
   cd serverless
   npx wrangler secret put ORACLE_KEYPAIR      # JSON array from ~/.config/solana/mainnet-keeper.json
   npx wrangler secret put CRANK_AUTH_TOKEN
   npx wrangler secret put RPC_URL             # Helius endpoint
   npx wrangler deploy
   npx wrangler deployments list               # confirm the deploy
   npx wrangler triggers list                  # confirm */3 is attached
   ```
   Then prove it end to end:
   ```bash
   curl -s https://<worker>/health | jq '{oldestFeedAgeSeconds, staleFeeds, healthy}'
   ```
   `healthy` must be `true` and `oldestFeedAgeSeconds` well under 600.

2. **Add an external uptime monitor on `/health`.** This is the missing piece — it is the
   only thing that tells you the keeper is dead when no runner fires at all. `/health`
   returns **200 when healthy and 503 when any feed is past the 540 s alert threshold**, so
   any monitor (BetterStack, UptimeRobot, Healthchecks.io, a cron on any box) can page you.
   Point it at `/health`, expect 200, alert on anything else, and check every 1–2 minutes.

   *This step is more important than either runner.* Without it you are relying on a silent
   component to report its own silence.

3. **Crank now** to unblock borrowing:
   ```bash
   KEEPER_KEY=~/.config/solana/mainnet-keeper.json \
     node mobile/scripts/keeper.mjs --network mainnet-beta
   ```
   It exits non-zero if either feed does not advance, so a clean exit now means something.
   (Before the fix above, exit 0 did not mean that.)

4. **Set `KEEPER_KEYPAIR_JSON`** in GitHub → Settings → Secrets and variables → Actions, so
   the Actions failover can sign. Re-enable the workflow if GitHub disabled it (Actions tab
   → the `keeper` workflow → "Enable workflow").

5. **Decide whether you need a second, independent runner.** A single Cloudflare account is
   now a single point of failure for the protocol's availability. The GitHub runner is not a
   strong backup because of the scheduling issues above; a plain `systemd` timer or a cron
   entry on any always-on host running `keeper.mjs` would be a more predictable secondary.
   The keeper is a stateless CLI — it needs only an RPC URL and the keeper keypair.

## 5. The structural recommendation

Keeping prices fresh with a centralised crank is a permanent operational liability: every
outage of your runner is a full protocol outage, and the 600 s bound leaves no room to sleep
through one.

The durable fix is to price from an **on-chain oracle** (Pyth or Switchboard) and treat the
admin feed as a fallback rather than the sole source, so a dead keeper degrades liveness
instead of halting the protocol. That is a program change and a redeploy — worth scheduling
with the round-15 work rather than bolting on later. The trade-off to weigh: an on-chain
oracle reintroduces dependency on a third party's feed quality and update cadence, which is
presumably why it was removed. The alternative is to accept the keeper dependency openly and
invest in step 2 above, so the outage is measured in minutes rather than nine hours.

## 5a. End-to-end verification (local validator, 2026-09-29)

The keeper fixes were dry-run against a `solana-test-validator` — not on mainnet, not on
devnet, and with a throwaway keypair — using the round-15 program build deployed locally.

**Happy path.** The keeper created both feeds from scratch, updated them, read them back,
reported `1s old — fresh` for each, and exited `0`.

**Failure path, with an A/B.** An RPC proxy in front of the validator returned `null` for
`getAccountInfo` on the two oracle PDAs while forwarding everything else, including
WebSocket — so the writes landed and confirmed, but the read-back could not confirm them.
That is precisely the case the old code mis-reported:

| | pre-fix keeper | post-fix keeper |
| :--- | :--- | :--- |
| Post-update line | `feed account does not exist yet` | `UNVERIFIED … write not confirmed after retries` |
| Final line | `All 2 feed update(s) succeeded.` | `FAILED: 2 feed update(s) did not succeed` |
| **Exit code** | **0** | **1** |

Same proxy, same validator, same keypair — only the keeper logic differed. The old code
reported a healthy crank while both feeds were unconfirmed, which is exactly how a nine-hour
outage went unnoticed.

To make the local run possible, `scripts/lib/cluster-guard.mjs` gained a `localnet` cluster.
It is authorised by **endpoint, not genesis hash** — a test validator mints a fresh random
genesis each run — and only a loopback URL qualifies, so `--cluster localnet` cannot be used
to bypass the guard against a remote RPC. Mainnet and devnet enforcement is unchanged.

Still unverified: nothing here exercised a real RPC provider's rate limiting, and the
`@solana/web3.js` version used locally may differ from the one in CI.

## 6. What was verified vs. assumed

- **Verified on chain:** four lifetime feed writes, their slots and timestamps, current feed
  ages (~9 h), pool state, and that the program's bound is 600 s.
- **Verified in source:** both silent-failure paths in `keeper.mjs` (now fixed), the program's
  staleness rejection, and the two cron expressions.
- **Not verified:** whether the Cloudflare Worker was ever deployed, and whether the GitHub
  workflow is currently enabled — both require access to those accounts. Step 1 and step 4
  exist to establish exactly that.
