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

## 2. How the keeper was lying about success

There is now **one implementation** — the Cloudflare Worker in `serverless/src/index.ts`
(`crankOracles`), which also backs the manual CLI and the GitHub Actions failover. The
standalone `mobile/scripts/keeper.mjs` duplicate has been deleted so the two cannot drift
apart again. None of these fixes is deployed yet.

**a) "Couldn't verify" was reported as "succeeded".** After sending the update, the keeper
read the feed back. If that read *failed* (RPC 429, timeout), `readFeedState` returned
`{exists:false}`, which fell through to the `else` branch — printing a success line and
**not** adding to `failures`. The run then exited `0`. A keeper that cannot reach the RPC
during verification would report a clean run forever.

Now: the post-check **retries** (3 attempts, backoff), and if it still cannot confirm the
write it reports `UNVERIFIED`, records a failure, and exits non-zero. Absence of evidence
is no longer treated as evidence of a landed update.

The rule lives in `verifyFeedsAdvanced`, which is exported so it is testable without a
network:

```bash
cd serverless && npm test    # 10 cases, exits non-zero on failure
```

It pins the regression directly: a null read, a throwing read, a truncated account, and a
feed that did not advance must all be reported unconfirmed and never as verified. There is no
test framework in `serverless/`, so this is a plain Node script — run it directly. It imports
`src/index.ts`, which Node type-strips natively and which needs `serverless/node_modules`
(`npm install`).

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

**This is why the duplicate was deleted.** Previously `mobile/scripts/keeper.mjs` and this
file were two independent implementations of the same job: fixing one did not fix the other,
which is exactly how the silent-success bug survived its first fix. There is now a single
implementation, so a fix cannot land on only half the system.

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
   cd serverless
   ORACLE_KEY=~/.config/solana/mainnet-keeper.json \
     NETWORK=mainnet-beta node src/cli.mjs
   ```
   It exits non-zero if either feed does not advance, so a clean exit now means something.
   (Before the fix above, exit 0 did not mean that.)

4. **Set `KEEPER_KEYPAIR_JSON`** in GitHub → Settings → Secrets and variables → Actions, so
   the Actions failover can sign. Re-enable the workflow if GitHub disabled it (Actions tab
   → the `keeper` workflow → "Enable workflow").

5. **Decide whether you need a second, independent runner.** A single Cloudflare account is
   now a single point of failure for the protocol's availability. The GitHub runner is not a
   strong backup because of the scheduling issues above; a plain `systemd` timer or a cron
   entry on any always-on host running `serverless/src/cli.mjs` would be a more predictable
   secondary.
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

## 5a. End-to-end verification (local validator, 2026-09-30)

The surviving implementation — `crankOracles` in `serverless/src/index.ts`, the code the
Cloudflare Worker actually runs — was dry-run against a `solana-test-validator` with the
round-15 program deployed locally and a throwaway keypair. Not mainnet, not devnet, and
nothing of yours touched.

**Happy path.** `node src/cli.mjs` created both feeds, sent the crank, and reported
`Crank succeeded and both feeds verified` — exercising the new `verifyFeedsAdvanced` on the
success path — then exited `0`.

**Failure path.** An RPC proxy in front of the validator returned `null` for `getAccountInfo`
on the two oracle PDAs while forwarding everything else, WebSocket included, so the
transaction landed and confirmed but the read-back could not confirm it:

```
❌ Execution Failed: Crank confirmed (2aJqYHCE…) but these feeds did not advance past
   1790739393: SOL $119.19, SKR $0.01833.
   Treating the run as failed rather than reporting success.
exit 1
```

That is the whole point: `confirmTransaction` succeeded, and the run still refused to report
success. Before the fix there was no read-back at all, so this exact scenario — a confirmed
crank whose effect cannot be verified — was indistinguishable from a healthy one.

**An earlier A/B, against the pre-fix code.** The same proxy was run against the standalone
`mobile/scripts/keeper.mjs` before it was deleted, comparing old and new: the old code
printed `All 2 feed update(s) succeeded.` and exited `0`; the new code reported `UNVERIFIED`
and exited `1`. Same proxy, same validator, same keypair — only the verification logic
differed. That implementation is gone, which is the point; the behaviour it proved is now
pinned by `npm test`.

To make the local run possible, both `scripts/lib/cluster-guard.mjs` and `src/index.ts` gained
a `localnet` cluster. It is authorised by **endpoint, not genesis hash** — a test validator
mints a fresh random genesis each run — and only a loopback URL qualifies, so `NETWORK=localnet`
cannot be used to bypass the guard against a remote RPC. Mainnet and devnet enforcement is
unchanged.

Still unverified: nothing here exercised a real RPC provider's rate limiting, and the
`@solana/web3.js` version used locally may differ from the one in CI.

## 6. What was verified vs. assumed

- **Verified on chain:** four lifetime feed writes, their slots and timestamps, current feed
  ages (~9 h), pool state, and that the program's bound is 600 s.
- **Verified in source:** the silent-failure paths (now fixed), the program's
  staleness rejection, and the two cron expressions.
- **Not verified:** whether the Cloudflare Worker was ever deployed, and whether the GitHub
  workflow is currently enabled — both require access to those accounts. Step 1 and step 4
  exist to establish exactly that.
