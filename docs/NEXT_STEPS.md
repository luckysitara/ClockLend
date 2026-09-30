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

## 1. Land the work (this machine)

Everything is currently **uncommitted**: 30 modified files plus 5 new documents.

```bash
cd /home/tiktoor/Clock-It
git status --porcelain          # review
node mobile/scripts/keeper.test.mjs              # 12/12
cd program && cargo test --release && cd ..      # 107 passed / 0 failed
```

Then commit. Suggested split, so the risky changes are separable from the documentation:

1. `fix(program): round-15 hardening — shared LTV cap, borrow PDA check, yield parking, type classifier`
2. `fix(ops): keeper fails closed; verify feeds after cranking`
3. `fix(serverless): close Lambda auth bypasses, redact RPC credentials`
4. `fix(mobile): align desk LTV with the program cap; correct UI claims`
5. `docs: honest claims pass, app spec, keeper liveness, multisig migration`

## 2. Push the rewritten history (this machine)

```bash
git push --force origin master
git push --force origin main
```

Expect resistance if either branch is protected — GitHub may refuse a force-push to a
protected branch; temporarily disable the protection, push, re-enable.

**Then rotate the Helius key regardless.** GitHub keeps unreachable objects reachable by SHA
for a while after a force-push, and the repository is **public**, so assume
the old key has already been scraped. Removing it from history limits future exposure; only
revoking it at Helius ends it. Rotate at provider → put the new value in `.env` locally and
in the Cloudflare secret — **never back into a tracked file**.

Also: your public default branch is `main`, which is GitHub's 1-line stub README. All the
real work is on `master`. Consider making `master` the default.

## 3. Redeploy round-15 (deploy machine)

### 3.1 Resync first — mandatory

```bash
git fetch origin
git log --oneline origin/master | head    # confirm the rewritten SHAs (HEAD will not be d7ca71a)
git reset --hard origin/master            # discard the old history
```
Do **not** merge or pull; the histories are unrelated after the rewrite.

### 3.2 Build, verify, deploy

```bash
cd program && cargo-build-sbf --sbf-out-dir target/deploy
sha256sum target/deploy/clock_lend.so
# Reference build produced on 2026-09-29: 31b4c68307359583c45173330354794d5e08df2e911b60808cc1677f533c1606 (364,960 B)
# A different toolchain may legitimately produce a different hash — record YOURS.
```

```bash
cd .. && node mobile/scripts/deploy-mainnet.mjs --upgrade --cluster mainnet-beta
```
Do **not** pass `--create-pool` (pool id 1 already exists and would collide) or
`--rotate-oracle` unless you intend it.

### 3.3 Re-verify — and update the record

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
