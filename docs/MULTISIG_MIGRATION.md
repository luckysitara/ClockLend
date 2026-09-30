# ClockLend → Squads v4 Multisig Migration Runbook

**Status:** draft, not executed. No transaction described here has been run.
**Date:** 2026-09-29
**Working branch:** `master` (the repo also has a `main`; work off `master`).
**Scope:** move the ClockLend program's **upgrade authority** and the **`AdminConfig.admin`** field to a
Squads Protocol v4 multisig with a timelock on the upgrade path.

---

## 0. Corrections to the brief — read this before anything else

Six claims in the original brief did not survive verification. Four of them change the plan;
two are outright blockers.

### 0.1 ❌ BLOCKER — the upgrade-authority keypair is not on this machine

The brief states the upgrade authority is "a single hot keypair at
`~/.config/solana/mainnet-deployer.json`". **That file does not exist on this machine.**

```
$ ls ~/.config/solana/
cli  id.json  install

$ ls ~/.config/solana/mainnet-deployer.json
ls: cannot access '...': No such file or directory
```

Every keypair reachable from this host was checked against the on-chain authority
`8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds`; none matches:

| Keypair file | Public key | Match? |
|---|---|---|
| `~/.config/solana/id.json` | `FL1UpMfPybHWgbM5GwzT8VhGseMMARj5guEnuoGunhZG` | no |
| `~/my_solana_wallet.json` | `9qD2ETYiohKrFVsZFBQEVsmX5UTt5AthALgjKRnnGbkw` | no |
| `~/solana-stablecoin-standard/wallets/authority.json` | `HyJ4MwjxF1Y9aoD7h2mgSK6VTFrPuizNiNv6abvm7VRk` | no |
| `~/solana-stablecoin-standard/wallets/program-keypair.json` | `5A7uQEJgX8ekoEkuPeUowSgfPYUesFtPpKXTwkkPqjHr` | no |
| `~/solana-stablecoin-standard/wallets/program-keypair1.json` | `GuUPxXn8CCuhuvW6yXnxCyoMc2FagWoYysDTfRsELaXq` | no |

**Do this first:** locate the key that actually controls `8YvdDpW…` (it may be on another
machine, a hardware wallet, or a backup). Until it is in hand:

- `solana program set-upgrade-authority` **cannot be signed** — step 3 is impossible.
- Instruction tag 13 (`InitializeAdmin`) **cannot be called at all** — not even to rotate the
  oracle. Both the admin move (step 5) and the emergency oracle rotation (§11) depend on it.

This is also the worst failure mode in the whole document: if that key is genuinely lost, the
program can never be upgraded again and `AdminConfig.admin` / `oracle_authority` are **frozen
permanently** (see §12.2). Establish the key is held before doing anything else.

### 0.2 ⚠️ The Squads program ID in the brief is wrong and does not exist on chain

The brief gives `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj72RbK`. The real Squads v4 program is:

```
SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf
```

Both strings are valid 32-byte base58, so this is not a typo you can spot by eye — it is a
different last few characters (`52pCf` vs `72RbK`). Verified three ways:

1. **On chain.** `getAccountInfo` against mainnet-beta:
   - `…Mjkvj52pCf` → `executable: true`, owner `BPFLoaderUpgradeab1e11111111111111111111111`
   - `…Mjkvj72RbK` → `{"value": null}` — **no account exists at that address**
2. **The program's own `declare_id!`** in
   `programs/squads_multisig_program/src/lib.rs`:
   `declare_id!("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");` (non-`testing` build).
3. **The Squads CLI hardcodes it** as its default in
   `cli/src/command/vault_transaction_create.rs`, `display_vault.rs`, `initiate_program_upgrade.rs`.

> **Why this matters more than a typo normally would.** Squads vault addresses are PDAs derived
> from `[b"multisig", multisig, b"vault", index]` **under the Squads program ID**. Derive the vault
> under the wrong program ID and you get a valid, well-formed address that no program will ever
> sign for. Setting the ClockLend upgrade authority to it would be irreversible (§12.2). Always
> take the vault address from the tool (`display-vault`), never type it from memory.

### 0.3 ⚠️ The deployer holds ~0.165 SOL, not ~164.7 SOL

`getBalance` for `8YvdDpW…` returns **`164,731,356` lamports**:

```
164,731,356 lamports ÷ 1e9 = 0.164731356 SOL
```

The brief's "~164.7 SOL" is this figure divided by `1e6` instead of `1e9`. The wallet holds about
**0.165 SOL** (roughly USD 25–35 at current prices), which is fee money, not a treasury.
§8 ("move the 164.7 SOL") is therefore a much smaller task than described — it is a
dust-sweep plus a decision, not a fund migration. **It also means the deployer key is not
carrying a large balance that justifies urgency on its own** — the urgency is about *authority*,
not about the lamports.

### 0.4 ⚠️ Oracle rotation is an *upgrade-authority* action, not an *admin* action

The brief's design premise — "once the upgrade authority is a Squads vault, admin/oracle rotation
itself becomes an M-of-N action" and "the ability of the multisig-held admin to rotate it away
instantly" — is **half right, and the half that is wrong drives the whole timelock decision.**

Reading `process_initialize_admin` (`program/src/processor.rs:1031`), tag 13 requires account 0 to
be a signer whose key equals the upgrade authority read from the ProgramData account
(`processor.rs:1067-1070`). The `AdminConfig.admin` field is **never** consulted for authorization.
So:

- Rotating the oracle authority **requires the upgrade authority to sign**.
- Therefore **oracle-rotation latency equals the upgrade multisig's timelock.**
- A second, faster multisig holding `AdminConfig.admin` **does not help** with oracle rotation.
  `AdminConfig.admin` is only consulted by tag 12 (`SetPriceFeed`, as a fallback writer) and tag 14/15/16
  (`WithdrawTreasury`, `InitializeSkrYieldVault`, yield ops).

Consequence: setting a 24-hour timelock means an oracle compromise takes **24 hours** to fix.
This tension is unavoidable in the current program design and is dealt with in §10 and §11.

### 0.5 ⚠️ Rotating `oracle_authority` does not immediately revoke the old key

In `process_set_price_feed`, write authorization for a **global** feed is:

```
feed.authority == signer   OR   AdminConfig.admin == signer   OR   AdminConfig.oracle_authority == signer
```
(`processor.rs:1218-1236`)

and on **every successful write**, the program does `feed.authority = *authority.key;`
(`processor.rs:1336`) — the feed's stored authority is whatever key wrote last, *not* a value
frozen at creation.

So after you rotate `oracle_authority` away from a compromised keeper, that old key **still
passes the `feed.authority == signer` branch** on every feed it last wrote. It is not locked out
until some other authorized writer overwrites `feed.authority` on each feed. A hostile old keeper
can also keep re-writing to hold that field. §11 gives the procedure that actually completes the
revocation.

### 0.6 ℹ️ The key holds more roles than the brief lists

Read on chain, `8YvdDpW…` is not only the upgrade authority and `AdminConfig.admin`. It is also the
**`LendingPool.authority`** for mainnet pool #1:

```
pool 4YC4rCNXva8ty6f1pKRC2NX7e5kufqowBYJDCMor12Wu  (CLK_POOL, pool_id 1, USDC EPjFWdd5…)
  authority = 8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds
```

This migration moves the **upgrade authority** and **`AdminConfig.admin`** only. The pool authority
is a separate role with a separate (and currently absent) rotation path — worth a deliberate
decision, not an oversight. It does not block this runbook.

---

## 1. Recommended configuration

| Item | Recommended value | Why |
|---|---|---|
| Multisig | one Squads v4 multisig, `vault_index 0` | only one is needed; see §2 |
| Threshold | **2-of-3** | tolerates one lost/offline key *and* one compromised member. 2-of-2 has no loss tolerance; 1-of-N is not a multisig; 3-of-3 has no availability |
| Members | 3 distinct humans/devices; **≥2 on hardware wallets** | see §4.1 |
| `config_authority` | **unset (`None`)** | a hot config authority can unilaterally rewrite members and threshold, gutting the multisig. See §4.3 |
| `time_lock` | **86400 (24 h)** | balances upgrade safety against oracle-incident latency (§2) |
| `rent_collector` | unset, or a cold key | reclaims rent from closed proposals |
| Upgrade authority | → Squads **vault PDA** | §5 |
| `AdminConfig.admin` | → same Squads **vault PDA** | §7 |
| `AdminConfig.oracle_authority` | **stays a hot key** (unchanged) | §10 |
| Upgrade-authority keypair after cutover | **destroyed / archived offline** | the whole point |

---

## 2. Why this shape: two tensions you cannot design away

Everything below follows from three verified properties of Squads v4 plus two of ClockLend.

**Squads v4's timelock is global to the multisig, not per-transaction.** `Multisig`
(`programs/squads_multisig_program/src/state/multisig.rs`) has a single `time_lock: u32` field,
documented as "how many seconds must pass between transaction voting settlement and execution".
`VaultTransaction` has **no** per-transaction `time_lock` field. Execution checks
`Clock::get()?.unix_timestamp - timestamp >= i64::from(multisig.time_lock)`. The cap is
`MAX_TIME_LOCK = 3 * 30 * 24 * 60 * 60` = **7,776,000 s (90 days)**.

Two consequences:

- You **cannot** put a timelock on upgrades while leaving other actions instant, within one
  multisig. Whatever you choose applies to *every* vault and config transaction from that
  multisig — including the emergency oracle rotation of §11.
- A config transaction changing the timelock is itself subject to the *current* timelock. There is
  no fast path to turn the timelock off. That is the point, but it also means a bad timelock value
  costs you one full lock period to correct.

**Oracle rotation needs the upgrade authority (§0.4).** So the timelock directly sets your
oracle-incident response time. This is the single most important dial in the design.

**Choosing 24 hours.** The timelock exists to give users and auditors time to exit or react if a
malicious or broken upgrade is pushed. Too short and it protects nobody; too long and every
legitimate fix — and every oracle rotation — is a day of downtime. 24 h is a reasonable balance for
a protocol of this size, and is the value assumed throughout. The trade-off is explicit:

| `time_lock` | Upgrade safety | Oracle-incident response | Choose when |
|---|---|---|---|
| 0 | none — multisig is M-of-N but instant | instant | you don't actually want a timelock |
| 6 h (21600) | weak | ~6 h | early stage, low TVL, fast iteration |
| **24 h (86400)** | **good** | **~1 day of degraded operation** | **recommended default** |
| 72 h (259200) | strong | ~3 days | high TVL; pair with the §10 hardening first |

One follow-up matters more than the exact number: at any real TVL, the correct fix for the
oracle-latency tension is **on-chain**, not in the timelock — see §10.3.

---

## 3. Pre-flight

All commands are read-only. Run them from a machine that can reach mainnet and (for §3.3) that
holds the authority key.

### 3.1 Confirm the program and its authority

```bash
solana program show 4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7 -u mainnet-beta
```

Expected (verified against mainnet at the time of writing):

```
Program Id: 4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7
Owner: BPFLoaderUpgradeab1e11111111111111111111111
Authority: 8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds
Last Deployed In Slot: 451698349
Data Length: 464,216 bytes
```

If `Authority:` shows anything other than `8YvdDpW…` — **stop**. Something has already changed and
the rest of this runbook is written against the wrong starting state.

### 3.2 Confirm the starting authority/admin/oracle triple on chain

These are the values that must hold before you start. Decode the two accounts:

```bash
# ProgramData: bytes [0..4]=discriminant 3, [4..12]=slot, [12]=Option tag (1=Some), [13..45]=authority
solana account 9ikmDTbbRhtgYKjRhcnzCK9RpPWQ8uTYUeNJ16kWMLSG -u mainnet-beta --output json

# AdminConfig (73 bytes): [0..8]="CLK_ADMN", [8]=is_initialized, [9..41]=admin, [41..73]=oracle_authority
solana account 7tCidaB2vu5N8KfKJ2Mqfm5dxbkvSqqvxHqkznYveroi -u mainnet-beta --output json \
  | python3 -c "
import sys,json,base64
A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def b58(b):
    n=int.from_bytes(b,'big'); s=''
    while n: n,r=divmod(n,58); s=A[r]+s
    for c in b:
        if c==0: s='1'+s
        else: break
    return s
raw=base64.b64decode(json.load(sys.stdin)['account']['data'][0])
print('discriminator :', raw[0:8])
print('is_initialized:', raw[8])
print('admin         :', b58(raw[9:41]))
print('oracle        :', b58(raw[41:73]))
"
```

The brief's values, **independently re-verified on chain** while writing this document:

| Field | Expected |
|---|---|
| ProgramData discriminator | `3` (ProgramData) |
| ProgramData slot | `451698349` |
| ProgramData authority option tag | `1` (`Some` — the program **is** upgradeable) |
| Upgrade authority | `8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds` |
| AdminConfig discriminator | `CLK_ADMN` |
| AdminConfig `is_initialized` | `1` |
| `AdminConfig.admin` | `8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds` |
| `AdminConfig.oracle_authority` | `HtiDpTkcWDDaQeRLSBvYDdw2sRJb5VvkD7EMvr5JWVzJ` |
| `AdminConfig` length | 73 bytes |

### 3.3 Confirm you hold the key — the §0.1 blocker

```bash
solana-keygen pubkey <path-to-the-upgrade-authority-keypair>
# must print exactly:
# 8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds
```

If it prints anything else, or the file is missing here and you cannot produce it, **stop and
resolve that first.**

### 3.4 Back the keypair up

A `solana program set-upgrade-authority` transaction is small and easy, but a destroyed or lost
authority key mid-migration is unrecoverable. Before touching anything:

- Copy the keypair to at least two offline media (or confirm the hardware wallet seed backup).
- Confirm the backup restores: derive the pubkey from the copy and check it still prints `8YvdDpW…`.
- Do **not** store it in the repo. `.env` here is gitignored (`*.env` in `.gitignore`); keep it that
  way. Note the repo's `.env` currently contains only `GITHUB_TOKEN` and no key material.

### 3.5 Record the fee payer and balances

```bash
solana balance 8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds -u mainnet-beta
# expect ~0.164731356 SOL  (NOT 164.7 — see §0.3)

solana balance HtiDpTkcWDDaQeRLSBvYDdw2sRJb5VvkD7EMvr5JWVzJ -u mainnet-beta
# expect ~0.04997 SOL — the keeper's fee runway, see §10.4
```

### 3.6 Know which repo scripts will stop working

These all load `~/.config/solana/mainnet-deployer.json` and sign as the authority. After cutover
they will fail (usually with an explicit refusal, which is the good case):

| Script | Role it signs as | After cutover |
|---|---|---|
| `mobile/scripts/deploy-mainnet.mjs` | upgrade authority (`DEPLOYER_KEY`) | must go through Squads |
| `scripts/rotate-oracle.mjs` | upgrade authority (`ADMIN_KEY`) | must go through Squads — it explicitly refuses if the signer is not the on-chain authority |
| `scripts/withdraw-treasury.mjs` | `AdminConfig.admin` | must go through Squads |
| `scripts/burn-skr.mjs` | `AdminConfig.admin` | must go through Squads |
| `scripts/deposit-liquidity.mjs` | `LendingPool.authority` | **unaffected by this migration** (§0.6) |

None of this blocks the migration; it is the expected cost of removing a hot key. Budget for it.

---

## 4. Step 1 — create the Squads multisig

### 4.1 Install the CLI

```bash
cargo install squads-multisig-cli
```

Verified: the crate **is published** — `squads-multisig-cli` v0.1.7, published 2025-12-16
(6,112 downloads at time of writing). The published 0.1.7 tarball was downloaded and inspected;
it does contain the `display_vault.rs` and `initiate_program_upgrade.rs` sources referenced below.

The CLI supports filesystem keypairs and Ledger, same as the Solana CLI:

```bash
--keypair /path/to/keypair.json
--keypair usb://ledger
--keypair "usb://ledger/<PUBKEY>?key=0/0"
```

### 4.2 Create it

```bash
squads-multisig-cli multisig-create \
  --rpc-url https://api.mainnet-beta.solana.com \
  --keypair /path/to/creator-keypair.json \
  --seed-keypair /path/to/multisig-seed.json \
  --members "<PUBKEY_A>,7" "<PUBKEY_B>,7" "<PUBKEY_C>,7" \
  --threshold 2
```

Verified from the published 0.1.7 source (`cli/src/command/multisig_create.rs`):

- `--members` takes `"<pubkey>,<permission>"` pairs, space-delimited, parsed by `parse_members`,
  which does `s.split(',')` and requires exactly two parts; the permission is parsed as a **`u8`
  bitmask**. `7` = Initiate|Vote|Execute. Use `7` for all members in a 2-of-3 unless you
  deliberately want separation of duties.
- `--threshold` is a `u16`.
- `--seed-keypair` is optional — "generates new keypair if not provided". The multisig PDA is
  derived from this key, so **record both the seed pubkey and the resulting multisig address**.
  Losing the seed *private* key is not fatal (it does not sign anything afterwards), but losing the
  *pubkey* makes the address harder to re-derive.
- `--config-authority` and `--rent-collector` are both optional.

**Recommended member set.** Three keys, held by three different people or at least three different
devices, with at least two on hardware wallets and stored in physically separate locations. A
2-of-3 where two of the three keys sit on the same laptop is a 1-of-1 in disguise. At least one
member should be someone who is not able to unilaterally deploy code.

The CLI prints the multisig address on success. **Record it** — call it `$MULTISIG`.

### 4.3 `config_authority` — leave it unset

The CLI's own README describes `--config-authority` as an address granted **"unilateral control
over the multisig configuration"**. Setting it to a hot key would let that single key add or
remove members and change the threshold without any other signer — which defeats the entire
migration.

⚠️ **Partial verification, stated honestly.** The Squads docs and the CLI README describe
`config_authority` as having unilateral config control, but I could **not** find the code path that
implements the bypass: `programs/squads_multisig_program/src/instructions/config_transaction_execute.rs`
requires a member with `Permission::Execute` to sign, requires `ProposalStatus::Approved`, and
enforces `TimeLockNotReleased` and `StaleProposal`, with no `config_authority` branch visible in
that file. The two sources disagree, or the bypass lives elsewhere.

This does not change the recommendation — **omit `--config-authority` entirely** and operate the
multisig autonomously. Given the ambiguity, do not set it to any key you would not trust with the
whole multisig.

### 4.4 Derive and record the vault address

```bash
squads-multisig-cli display-vault \
  --multisig-address "$MULTISIG" \
  --vault-index 0
```

Prints `Vault: <ADDRESS>`. Call it `$VAULT`.

Verified from `cli/src/command/display_vault.rs` (present in published 0.1.7). Note this subcommand
spells its flag `--program-id` (optional, defaults to the mainnet Squads program) while
`initiate-program-upgrade` spells the same concept `--squads-program-id` — an inconsistency in the
upstream CLI, not an error in this document.

You can derive `$VAULT` independently to cross-check. The seeds (verified in
`state/seeds.rs` and in `vault_transaction_execute.rs`, which builds
`[SEED_PREFIX, multisig_key, SEED_VAULT, &vault_index.to_le_bytes(), &[vault_bump]]`), with
`SEED_PREFIX = b"multisig"`, `SEED_VAULT = b"vault"`, and the index as a **single byte**:

```
$VAULT = findProgramAddress([ b"multisig", $MULTISIG, b"vault", [0] ],
                            SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf)
```

The vault index is a `u8` — `getVaultPda` in the TS SDK uses `toU8Bytes(index)` and asserts
`0 <= index < 256`. (Transaction/proposal indices, by contrast, are `u64`.)

**Check, do not assume:** `$VAULT` must decode to an off-curve (PDA) address, and it must be
non-zero and different from `$MULTISIG`. Do not proceed if you cannot derive it two ways.

### 4.5 Add the timelock

The timelock is set with a **config transaction**, which itself requires the full proposal flow.

```bash
# 1. Create the config proposal. 86400 = 24 hours.
squads-multisig-cli config-transaction-create \
  --rpc-url https://api.mainnet-beta.solana.com \
  --keypair /path/to/member-a-keypair.json \
  --multisig-pubkey "$MULTISIG" \
  --action "SetTimeLock 86400"

# 2. Read the transaction index from step 1's output, then have each member approve:
squads-multisig-cli proposal-vote \
  --multisig-pubkey "$MULTISIG" \
  --keypair /path/to/member-a-keypair.json \
  --transaction-index <IDX> --action Approve

squads-multisig-cli proposal-vote \
  --multisig-pubkey "$MULTISIG" \
  --keypair /path/to/member-b-keypair.json \
  --transaction-index <IDX> --action Approve

# 3. Once the threshold is met, execute:
squads-multisig-cli config-transaction-execute \
  --multisig-pubkey "$MULTISIG" \
  --keypair /path/to/member-a-keypair.json \
  --transaction-index <IDX>
```

Verified from the CLI README: the action string is exactly `SetTimeLock <TIME_LOCK_VALUE>`, and
`config-transaction-create` / `proposal-vote` / `config-transaction-execute` are the subcommand
names. Actions are matched case-sensitively (`SetTimeLock`, not `settimelock`).

⚠️ **Note the flag-spelling inconsistency.** The upstream README's syntax blocks use hyphens
(`--rpc-url`, `--transaction-index`) while several of its *example* commands use underscores
(`--rpc_url`, `--transaction_index`). I checked the published 0.1.7 clap definitions: the struct
fields are `rpc_url` and `transaction_index`, which clap derives as **`--rpc-url` and
`--transaction-index`**. Use hyphens. The README examples with underscores are wrong.

⚠️ **Gotcha, verified in the docs:** executing `SetTimeLock`, `AddMember`, `RemoveMember` or
`ChangeThreshold` *invalidates other active transactions* (both config and vault type) — this is
the `stale_transaction_index` mechanism. Set the timelock **before** creating any other proposal,
and never leave an unrelated proposal pending across a config change.

**Before going further, confirm the timelock took:** the multisig account's `time_lock` should now
read `86400`. Do not move the upgrade authority with a `time_lock` of `0`.

---

## 5. Step 2 — move the upgrade authority

This is the irreversible-ish step. Everything above is reversible; this is not (see §12).

### 5.1 Rehearse without sending

`set-upgrade-authority` supports signing without submission:

```bash
solana program set-upgrade-authority 4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7 \
  --new-upgrade-authority "$VAULT" \
  --skip-new-upgrade-authority-signer-check \
  --upgrade-authority /path/to/mainnet-deployer.json \
  --sign-only \
  -u mainnet-beta
```

Verified flags, from the locally installed Agave CLI (`solana-cli 3.1.9`, `--help` output).
`--sign-only` and `--dump-transaction-message` are both available; use `--sign-only` to produce a
signed message you inspect but do not submit.

### 5.2 The real command

```bash
solana program set-upgrade-authority 4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7 \
  --new-upgrade-authority "$VAULT" \
  --skip-new-upgrade-authority-signer-check \
  --upgrade-authority /path/to/mainnet-deployer.json \
  -u mainnet-beta
```

**`--skip-new-upgrade-authority-signer-check` is mandatory here.** The CLI's own help for
`--new-upgrade-authority` says it "is strongly recommended to pass in a keypair to prevent
mistakes", and that you can "opt out of this behavior by passing
`--skip-new-upgrade-authority-signer-check`". A Squads **vault PDA is off-curve and has no private
key** — it physically cannot sign the outer `set-upgrade-authority` transaction. Without this flag
the CLI will demand a signature that cannot exist and the command will fail. With it, only the
*current* authority signs, which is all the loader requires.

> Double-check `$VAULT` character by character before hitting enter. This flag removes the CLI's
> safety net against a mistyped destination, and an authority set to a key you do not control is
> unrecoverable (§12.2).

### 5.3 What this does and does not do

The loader instruction is `bpf_loader_upgradeable::set_authority`. It changes the authority field
of the ProgramData account. The program binary does not change, the program ID does not change,
the ProgramData address does not change, and `AdminConfig` is untouched. **Downtime is zero.**

One thing it *does* change immediately: `InitializeAdmin` (tag 13) now requires the Squads vault
to sign — so **from this moment, every admin and oracle rotation is an M-of-N timelocked action.**
That is the goal, but it means §11's emergency path is now mediated by the multisig.

---

## 6. Step 3 — verify the move

```bash
solana program show 4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7 -u mainnet-beta
```

Expected:

```
Authority: <$VAULT>          # the Squads vault PDA, not 8YvdDpW…
```

Confirm all three of these, not just the first:

1. `Authority:` is exactly `$VAULT`, and `$VAULT` is the value `display-vault` printed.
2. The **ProgramData account address is unchanged** — still
   `9ikmDTbbRhtgYKjRhcnzCK9RpPWQ8uTYUeNJ16kWMLSG`. A changed ProgramData address would mean you
   are looking at a different program.
3. `AdminConfig` (`7tCidaB2vu5N8KfKJ2Mqfm5dxbkvSqqvxHqkznYveroi`) is **byte-identical** to the
   §3.2 read — particularly `admin` and `oracle_authority`, which must still be `8YvdDpW…` and
   `HtiDpTkc…`. Moving the upgrade authority must not disturb `AdminConfig`.

Independent check that does not rely on the CLI decoding anything:

```bash
solana account 9ikmDTbbRhtgYKjRhcnzCK9RpPWQ8uTYUeNJ16kWMLSG -u mainnet-beta --output json \
  | python3 -c "
import sys,json,base64
A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def b58(b):
    n=int.from_bytes(b,'big'); s=''
    while n: n,r=divmod(n,58); s=A[r]+s
    for c in b:
        if c==0: s='1'+s
        else: break
    return s
raw=base64.b64decode(json.load(sys.stdin)['account']['data'][0])
print('discriminant     :', int.from_bytes(raw[0:4],'little'))
print('upgrade authority:', b58(raw[13:45]))
"
```

### 6.1 On Solscan

Open the program (`https://solscan.io/account/4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7`) and
check the **Program Data / Upgrade Authority** field on the program page or the ProgramData account
page (`https://solscan.io/account/9ikmDTbbRhtgYKjRhcnzCK9RpPWQ8uTYUeNJ16kWMLSG`). It should list
`$VAULT` as the upgrade authority. If Solscan has not re-indexed yet, trust the RPC read above —
`solana program show` is authoritative and Solscan is a cache.

The transaction itself should show exactly **one signer** (the old authority, `8YvdDpW…`) and a
`Set Authority` instruction against the upgradeable loader. Anything else — an `Upgrade`
instruction, a buffer, a second signer — means something other than what this runbook describes
was executed. Investigate before proceeding.

---

## 7. Step 4 — move `AdminConfig.admin` to the vault

### 7.1 Why this must go through Squads as a CPI

`process_initialize_admin` asserts account 0 is a signer *and* that its key equals the ProgramData
upgrade authority. After §5 the upgrade authority is `$VAULT`, an off-curve PDA with no private
key. The only way a PDA can sign is `invoke_signed` — i.e. **Squads must CPI into ClockLend**,
passing the vault as the signer of the inner instruction. A plain top-level transaction from the
vault address is impossible.

This is the mechanism, and it is the same one used for the oracle rotation of §11 — build it once,
reuse it.

### 7.2 The exact instruction to embed

ClockLend instruction **tag 13** (`InitializeAdmin`, variant index 13 → borsh single byte `0x0d`).
No arguments. Account order from `process_initialize_admin` (`processor.rs:1035-1094`), cross-checked
against the working `scripts/rotate-oracle.mjs:196-208` in this repo, which already builds it:

| # | Account | Signer | Writable | Notes |
|---|---|---|---|---|
| 0 | **`$VAULT`** | **yes** | yes | must equal the on-chain upgrade authority |
| 1 | `7tCidaB2vu5N8KfKJ2Mqfm5dxbkvSqqvxHqkznYveroi` | no | **yes** | the `AdminConfig` PDA `[b"admin"]` |
| 2 | `11111111111111111111111111111111` | no | no | System Program |
| 3 | `9ikmDTbbRhtgYKjRhcnzCK9RpPWQ8uTYUeNJ16kWMLSG` | no | no | ProgramData — the upgrade-authority proof |
| 4 | *(optional)* new admin | no | no | **omit to leave `admin` unchanged** |
| 5 | *(optional)* new oracle authority | no | no | omit to leave `oracle_authority` unchanged |

Data: `[13]` — a single byte. (Verified: `instruction.rs` uses `try_from_slice` (borsh), and the
variant is 14th in declaration order, 0-based index 13; `scripts/rotate-oracle.mjs` sends
`Buffer.from([13])`.)

Two rotation semantics worth knowing, both read from the source:

- Accounts 4 and 5 are read positionally **only if present** (`next_account_info(...).ok()`); an
  absent account leaves that field untouched. Passing an account at position 4 but not 5 rotates
  admin only.
- **Neither is required to be a signer.** The guard is entirely on account 0. So to set
  `admin = $VAULT` you pass `$VAULT` at position 4 and it does not need to sign.
- The handler also **rotates `SkrYieldVault.authority`** for any yield-vault accounts passed in
  `remaining_accounts` (`processor.rs:1097-1116`). If a yield vault has been initialized, append it
  to the instruction's accounts so its authority follows `admin`. If it has not, there is nothing
  to do.

### 7.3 Recommended call

To set `admin = $VAULT` while **leaving the oracle key alone** (the §10 recommendation):

```
programId : 4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7
accounts  :
  0. { pubkey: $VAULT,                                       isSigner: true,  isWritable: true  }
  1. { pubkey: 7tCidaB2vu5N8KfKJ2Mqfm5dxbkvSqqvxHqkznYveroi,  isSigner: false, isWritable: true  }
  2. { pubkey: 11111111111111111111111111111111,             isSigner: false, isWritable: false }
  3. { pubkey: 9ikmDTbbRhtgYKjRhcnzCK9RpPWQ8uTYUeNJ16kWMLSG,  isSigner: false, isWritable: false }
  4. { pubkey: $VAULT,                                       isSigner: false, isWritable: false }  // new admin
  5. { pubkey: HtiDpTkcWDDaQeRLSBvYDdw2sRJb5VvkD7EMvr5JWVzJ,  isSigner: false, isWritable: false }  // keep oracle
data      : [13]
```

Account 5 is redundant (omitting it would also keep the oracle) but passing it explicitly is
preferred: it makes the proposal reviewable — a reviewer can see the intended oracle value without
having to know the "absent means unchanged" rule.

### 7.4 How to build it

**Option A — TypeScript SDK (recommended).** `@sqds/multisig` (v2.1.4 at time of writing). This is
the only path I could fully verify for building an *arbitrary* instruction. Follow the official
pattern:

```ts
import * as multisig from "@sqds/multisig";
import { PublicKey, Connection, TransactionMessage } from "@solana/web3.js";

const connection = new Connection("<your rpc url>");
const createKey = new PublicKey("<your seed pubkey>");
const [multisigPda] = multisig.getMultisigPda({ createKey });
const [vaultPda]    = multisig.getVaultPda({ multisigPda, index: 0 });

const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
const transactionIndex = BigInt(Number(multisigInfo.transactionIndex) + 1);

const clocklendIx = {
  programId: new PublicKey("4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7"),
  keys: [
    { pubkey: vaultPda,  isSigner: true,  isWritable: true  },
    { pubkey: new PublicKey("7tCidaB2vu5N8KfKJ2Mqfm5dxbkvSqqvxHqkznYveroi"), isSigner: false, isWritable: true  },
    { pubkey: new PublicKey("11111111111111111111111111111111"),            isSigner: false, isWritable: false },
    { pubkey: new PublicKey("9ikmDTbbRhtgYKjRhcnzCK9RpPWQ8uTYUeNJ16kWMLSG"), isSigner: false, isWritable: false },
    { pubkey: vaultPda,  isSigner: false, isWritable: false },
    { pubkey: new PublicKey("HtiDpTkcWDDaQeRLSBvYDdw2sRJb5VvkD7EMvr5JWVzJ"), isSigner: false, isWritable: false },
  ],
  data: Buffer.from([13]),
};

// The vault is the payer of the inner message — this is what the official
// "Create Vault Transaction" example does, and it is what makes the vault a
// signer that Squads will satisfy via invoke_signed at execution time.
const message = new TransactionMessage({
  payerKey: vaultPda,
  recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
  instructions: [clocklendIx],
});

await multisig.instructions.vaultTransactionCreate({
  multisigPda,
  transactionIndex,
  creator: member,
  vaultIndex: 0,
  ephemeralSigners: 0,
  transactionMessage: message,
  memo: "ClockLend: rotate AdminConfig.admin to Squads vault",
});
```

Then approve to threshold and execute:
`multisig.instructions.proposalApprove` → `multisig.instructions.vaultTransactionExecute`.

⚠️ **Signer flags, both layers — getting this backwards breaks the CPI.**
Inside the **inner** message the vault **must** be `isSigner: true` (and the message payer), because
it is the account ClockLend's `assert_signer` checks. In the **outer** execute instruction's
remaining accounts the vault must **not** be marked as a signer — Squads derives and signs it
itself. The SDK helper `accountsForTransactionExecute` handles the outer layer; a comment in the
SDK notes that "vaultPda and ephemeralSignerPdas cannot be marked as signers" *for that outer
instruction*.

**Option B — Squads web app** (`https://app.squads.so`, linked from `https://squads.so`). The app
can build a transaction from a pasted instruction. ⚠️ **Unverified:** my probe of `app.squads.so`
returned HTTP 429 (rate-limited), and I could not confirm the current UI flow or whether it accepts
a fully-specified raw instruction with per-account signer flags. If you use it, verify the built
message against §7.2 before approving — the `display-transaction` command below is the check.

**Option C — the CLI's `vault-transaction-create` — do not use for this.**
The subcommand exists, but its `--transaction-message` flag is declared `Vec<u8>` and the bytes go
straight into `VaultTransactionCreateArgs { transaction_message }`
(`cli/src/command/vault_transaction_create.rs`). That means you must hand-serialize the entire
compiled `VaultTransactionMessage` (account keys, per-instruction metas, signer/writable counts,
lookup tables) as a byte array. The README's only example is the opaque
`--transaction-message [1, 2, 3, 5, 5, 6, 7, 8]`. ⚠️ **I could not find any documentation of this
byte format, and I am not going to guess it.** Use Option A.

### 7.5 Review the proposal before approving

Whatever built it, decode it before the second signature:

```bash
squads-multisig-cli display-transaction --transaction-address <VAULT_TRANSACTION_PDA>
```

This prints each instruction's program ID, accounts with writable/signer flags, and base58 data
(verified from the CLI README). Check: program ID is `4Dp2A6SH…`, data is the single byte `13`,
account 0 is the vault **and is flagged as a signer**, account 3 is the ProgramData address.

### 7.6 Verify

Re-run the §3.2 decode. Expected change:

```
admin         : <$VAULT>            # was 8YvdDpW…
oracle        : HtiDpTkc…           # unchanged
```

Then confirm the rotation is real by exercising it: with `admin = $VAULT`, tag 14
(`WithdrawTreasury`) and tag 15/16/17 (yield ops) now require a Squads proposal. Conversely,
`8YvdDpW…` should no longer be able to call them.

---

## 8. Step 5 — the lamports in the hot deployer wallet

**There are only ~0.165 SOL here, not 164.7 (§0.3).** So this is not a fund migration; it is
housekeeping, and the section is short for that reason.

```bash
solana balance 8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds -u mainnet-beta
```

What to do, in order:

1. **After §5 is verified**, the key no longer controls anything. Sweep the balance out, keeping
   enough for one or two more transactions until you are certain the migration succeeded:
   ```bash
   solana transfer <DESTINATION> <AMOUNT> --from /path/to/mainnet-deployer.json \
     --allow-unfunded-recipient -u mainnet-beta
   ```
2. Send it to cold storage or to the multisig vault. Note the vault is a normal Solana account and
   can hold SOL, but funds sent there can only be moved by a multisig proposal — so for a small
   residual balance, cold storage is simpler.
3. Only then archive or destroy the keypair.

**Why do this at all if it is only 0.165 SOL?** Because the point of the migration is to *retire the
hot key*, and a key with a live balance and a live keyfile is a key that stays in use. Leaving it
funded invites someone to keep using it — and before §5 it is also the upgrade authority, which is
the real risk. The ordering in the brief ("do this early") is right for a different reason than
stated: do it **early in the sense of immediately after the authority has moved**, so the window
in which the key is both funded and authoritative closes as fast as possible. Do **not** drain it
before §5 — you need it to pay for the `set-upgrade-authority` transaction.

---

## 9. Step 6 — post-cutover handover

The migration is not finished when the transactions confirm; it is finished when the team's written
record stops describing the old world. These in-repo documents currently state that `8YvdDpW…` is
the upgrade authority and admin, and will be actively misleading after §5 and §7:

| Location | What it says now | Action |
|---|---|---|
| `docs/MAINNET_RUNBOOK.md:24,27` | upgrade authority / `admin` = `8YvdDpW…` | update to `$VAULT` |
| `docs/MAINNET_RUNBOOK.md:57` | "Deployer / upgrade authority / admin \| `~/.config/solana/mainnet-deployer.json` … Single key. Not a multisig, not timelocked." | replace with the multisig row |
| `docs/MAINNET_RUNBOOK.md:268` | "Upgrade authority = deployer key \| Store offline; rotate via `set-upgrade-authority` if needed" | the rotation path is now Squads, not `set-upgrade-authority` |
| `README.md:20` | "upgrade authority `8YvdDpW…`" | update |
| `scripts/rotate-oracle.mjs` | hard-refuses unless the signer is the on-chain upgrade authority | keep the refusal (it is a good guard) but add a Squads path or a pointer to this document |
| `mobile/scripts/deploy-mainnet.mjs`, `scripts/withdraw-treasury.mjs`, `scripts/burn-skr.mjs` | assume a local signer keypair | document that they now require a Squads proposal |

Also worth doing while it is fresh: write down who holds each of the three member keys, where the
backups are, and what the agreed incident rota is (§11.4). A 2-of-3 whose key custody exists only in
three people's heads is one departure away from being a 1-of-2 — and if it ever becomes effectively
1-of-1, none of the guarantees in this document are real.

---

## 10. The keeper decision

### 10.1 The tension, stated precisely

`SetPriceFeed` (tag 12) is called by a keeper that must run faster than the program's price
staleness bound. Verified in `processor.rs`:

- `ADMIN_FEED_MAX_PRICE_AGE_SECS = 600` (`processor.rs:3836`) — pricing reads fail closed when a
  feed is older than 600 s, and the effective bound is `min(feed.max_staleness_seconds, 600)`
  (`processor.rs:1552`, `1625`, `2176`). The stored 3600 s is retained for monitoring only.
- The production crank cadence is **3 minutes** — `serverless/wrangler.toml: crons = ["*/3 * * * *"]`.

A Squads multisig **cannot** sign an unattended crank: every write would need M-of-N human
approval plus the timelock. Making `oracle_authority` the vault would halt the protocol within
10 minutes. So the oracle authority **must remain a hot key**.

### 10.2 Recommended configuration

**Keep `oracle_authority` as a hot key. Do not move it to the vault.**

Specifically:

- Leave `oracle_authority = HtiDpTkcWDDaQeRLSBvYDdw2sRJb5VvkD7EMvr5JWVzJ` as it is today, or
  rotate to a fresh dedicated key (recommended, if the current one has ever been on a shared
  host), but **not** to the vault.
- Keep `AdminConfig.admin = $VAULT` (§7). The admin can rotate the oracle — but only via tag 13,
  which needs the *upgrade authority*, i.e. the multisig plus the timelock (§0.4).
- Ring-fence the keeper key: dedicated host/container, no outbound access beyond its RPC, the
  keyfile readable only by the crank process, and its own funded account (not the deployer key).

**The risk this accepts, bounded by what exactly:**

| Bound | Real? |
|---|---|
| ±25 % per update (`MAX_PRICE_MOVE_BPS = 2500`, `processor.rs:3840`) | **Weaker than it sounds.** The clamp is per-update, and there is no minimum interval between updates and no cumulative limit. A compromised keeper can step 25 % per transaction, hundreds of transactions per minute, and walk the price arbitrarily far. It bounds a *single* fat-finger, not a *determined* attacker. |
| "It can only write prices, not move funds" | **True and important.** There is no path from the oracle key to the treasury, vaults, or collateral. The damage is mispricing: bad LTV decisions, wrongful liquidations, loans issued against inflated collateral. |
| "The admin can rotate it away instantly" | **False, and this is the crux.** Rotation needs the upgrade authority (§0.4), so it costs a full multisig proposal **plus the 24 h timelock**. There is no instant revoke in this design. |

**So the honest summary is:** this configuration is correct and is what I recommend, but the third
bound in the brief does not exist, and the second is weaker than it looks. The mitigation is §10.3.

### 10.3 Recommended follow-up — make the bound real, on chain

The timelock-vs-oracle-latency tension is a **program** problem, and it is fixable with the very
upgrade path this migration creates. As a near-term upgrade (through the new timelocked path,
which is exactly what it is for), add to `process_set_price_feed`:

1. A **minimum interval** between updates of the same feed (e.g. reject a write less than 60 s after
   the last one). This converts the per-update clamp into a genuine rate limit: 25 % per minute is
   still bounded and observable, 25 % per slot is not.
2. A **cumulative deviation bound** over a rolling window (e.g. reject a move more than N % from a
   slowly-updated EMA), so a keeper cannot ratchet price monotonically in one direction.
3. Optionally, **restrict the admin fallback path** to tag 13 and drop `admin == signer` from the
   tag 12 authorization, so only the dedicated keeper can write prices.

With (1) and (2) in place, a compromised keeper key is bounded to a slow, detectable drift, which is
what makes a 24 h oracle-rotation latency acceptable. Without them, a 24 h latency is a real
exposure and you should consider a shorter timelock (§2) instead.

**Alternative considered and not recommended for now: a dedicated crank program.** Deploy a small
on-chain program that owns `oracle_authority`, enforces the rate limit above in code, and is itself
upgradeable by the Squads multisig. This gives a program-as-signer crank with the policy enforced
on chain rather than by the program you are trying to protect. The cost is real: another program to
write, review, deploy and monitor; a new trusted component; and the `oracle_authority` becomes that
program's PDA, so the crank program's own upgrade path becomes security-critical. Given ClockLend
already has an upgradeable program that can enforce the same limits directly, §10.3 is the cheaper
and less risky route. Revisit if the keeper must run in an environment you do not control.

### 10.4 Operational: the keeper key is underfunded right now

`HtiDpTkc…` holds **49,970,000 lamports ≈ 0.04997 SOL**. The crank pays its own fees from this
account (the code comments confirm the `/crank` endpoint "spends the oracle authority's lamports").

At the production cadence of 480 cranks/day and the 5,000-lamport base fee for a single-signature
transaction, that is roughly `480 × 5000 = 2,400,000` lamports/day ≈ **0.0024 SOL/day**, or about
**three weeks** of runway. If the crank also pays a priority fee, this collapses fast — a modest
25,000-lamport priority fee per crank is ~0.012 SOL/day (~4 days), and a 250,000-lamport one is
~0.12 SOL/day (**under a day**).

⚠️ I could not determine the exact per-crank fee from the repo (the fee configuration is not
visible in `crank_oracles.mjs` / the keeper CLI as read), so **measure it**: check the recent crank
transactions' fee on Solscan and compute the real daily burn.

Either way the lesson is the same, and it is urgent independently of this migration: **when this
balance runs out the keeper stops, the feeds go stale, and borrowing fails closed.** Nothing
alerts you. Add a balance alarm, top the key up on a schedule, or better, decouple the fee payer
from the signing key so the operational key can be rotated without touching the on-chain oracle
authority.

---

## 11. Emergency procedures

### 11.1 Keeper key compromised

**There is no instant on-chain revoke. Plan for a 24 h window.** The rotation itself is tag 13 with
a new oracle account at position 5 (§7.2), proposed through the multisig — so it costs a proposal,
M-of-N approvals, and the full timelock.

```bash
# 1. Immediately, off chain: stop the compromised crank process. If the attacker
#    is writing prices, you cannot out-write them by volume — but a stopped
#    process removes the friendly noise and makes the attacker's writes obvious.

# 2. Immediately: stand up a NEW keeper key on a clean host, funded and tested
#    against devnet.

# 3. Build the tag-13 rotation to the new key, exactly as §7.3 but with
#    account 5 = <NEW_ORACLE_KEY> and account 4 = $VAULT (keep admin).
#    Approve to threshold, then execute. This waits out the timelock.
```

**4. The step that actually completes the revocation.** Until a new authorized writer overwrites
each feed, the old key is still `feed.authority` and still authorized (§0.5). Immediately after the
rotation executes:

- Have the new keeper push a price update for **every** global feed, with a high priority fee so
  its writes land first. Once each feed's `authority` field flips to the new key, the old key is
  out permanently: it is no longer `feed.authority`, no longer `AdminConfig.admin`, and no longer
  `oracle_authority`.
- Alternatively (or if the new keeper cannot win the race), execute a `SetPriceFeed` (tag 12)
  through the multisig on each feed. With `admin = $VAULT`, the vault is an authorized writer, so a
  vault write sets `feed.authority = $VAULT` and locks the old key out for good. This costs a
  timelocked proposal per feed, so use it as the fallback, not the first move.

Verify each feed's authority by reading the `PriceFeed` account (`authority` is the last 32 bytes
before the staleness field — confirm the offset against `PriceFeed::LEN` in `state.rs` rather than
assuming; this document has not verified that offset).

**Honest caveat:** during the timelock window a determined attacker can keep re-writing to hold
`feed.authority`. The steady state after §10.3's rate limiting lands is far better; without it,
this window is a genuine exposure. This is the strongest practical argument for §10.3.

### 11.2 Pause

**ClockLend has no pause instruction.** The instruction set is 19 tags
(`InitializePool` … `WithdrawUnusedYield`, indices 0–18) with no pause/unpause. So there is no
admin switch that halts the protocol.

The closest available lever is the price-feed staleness bound. Because value-authorizing paths fail
closed on stale feeds (`ADMIN_FEED_MAX_PRICE_AGE_SECS = 600`):

> **Stopping the keeper halts new borrowing within ~10 minutes.**

State this accurately, because it is easy to over-claim:

- It stops **new borrowing** (pricing reads revert).
- It does **not** stop repayments, withdrawals, liquidations, or `ClaimDefault`.
- It is a denial of service on yourself as much as on an attacker, and it degrades trust.

If a real pause is required for incident response, that too is a program upgrade (§10.3 is the
natural place to add it).

### 11.3 Upgrade

```bash
# 1. Write the new binary to a buffer, on a machine with the program source.
solana program write-buffer target/deploy/clocklend.so -u mainnet-beta
#    Record the buffer address.

# 2. Set the BUFFER's authority to the vault as well, so the upgrade cannot be
#    front-run by whoever holds the buffer authority.
solana program set-buffer-authority <BUFFER_ADDRESS> \
  --new-buffer-authority "$VAULT" \
  --buffer-authority <BUFFER_AUTHORITY_KEYPAIR> -u mainnet-beta
#    (Same --skip-new-upgrade-authority-signer-check reasoning as §5.2 applies
#     if the CLI demands the new authority's signature.)

# 3. Propose the upgrade through Squads:
squads-multisig-cli initiate-program-upgrade \
  --keypair /path/to/member-keypair.json \
  --multisig-pubkey "$MULTISIG" \
  --vault-index 0 \
  --buffer-address <BUFFER_ADDRESS> \
  --program-to-upgrade-id 4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7 \
  --spill-address <SPILL_ADDRESS> \
  --approve

# 4. Vote to threshold, wait out the timelock, execute:
squads-multisig-cli vault-transaction-execute \
  --multisig-pubkey "$MULTISIG" --keypair ... --transaction-index <IDX>
```

Verified from `cli/src/command/initiate_program_upgrade.rs` in the published 0.1.7 crate: the
subcommand builds a `bpf_loader_upgradeable::upgrade` instruction and its flags are
`--buffer-address`, `--program-to-upgrade-id`, `--spill-address`, `--vault-index`, `--multisig-pubkey`,
`--memo`, `--priority-fee-lamports`, `--approve`, and `--squads-program-id` (note: **not**
`--program-id`, unlike `display-vault`). `--spill-address` receives the buffer's remaining rent.
⚠️ This subcommand is **not** in the CLI README; I verified it from the published source, and its
clap name `initiate-program-upgrade` follows clap's default kebab-casing of the `InitiateProgramUpgrade`
variant. Confirm with `squads-multisig-cli --help` before relying on it.

Note `--approve` "only works if the proposer has Vote permission" (from the source comment).

### 11.4 What the timelock means for incident response

Say it plainly: **the timelock delays your own fixes as much as an attacker's.** With
`time_lock = 86400`:

- A critical bug found at 09:00 cannot be patched on chain before ~09:00 the next day, at the
  earliest — and that assumes every signer is awake and available to approve immediately.
- If two of three signers are asleep, travelling, or unreachable, the fix waits for them. The
  timelock clock does not start until the **threshold is met**, not when the first member approves
  (`timestamp` is recorded on the transition to `Approved`).
- Clearing the timelock is not a fast path: changing `time_lock` is itself a config transaction
  subject to the current timelock (§2). Recovering from a bad timelock costs one full lock period.

Concrete preparation that costs nothing now and buys back most of the lost time:
agree and rehearse an incident rota (who approves, how they are reached, within what SLA — aim for
all signers reachable inside 2 h); pre-stage the tooling of §7.4 and §11.3 so no one is writing a
script during an incident; and keep a tested rollback binary buffer ready.

---

## 12. Rollback

### 12.1 Rolling back the authority move

**If the migration goes wrong and you still control the new authority, this is recoverable.**
Post-§5 the new authority is `$VAULT`, and you control the multisig, so you can propose a
transaction that sets the authority back to `8YvdDpW…`:

Build a vault transaction whose instruction is the BPF upgradeable loader's `SetAuthority`
setting the ClockLend ProgramData's authority back to `8YvdDpW…`. Mark the vault as a signer,
propose, approve to threshold, wait the timelock, execute.

No CLI helper listed above covers this: `initiate-program-upgrade` builds an `Upgrade`
instruction, not a `SetAuthority`. Build it by hand with the same TS SDK pattern as §7.4
(`multisig.instructions.vaultTransactionCreate`, with the loader instruction as the inner
instruction and the vault as its signer).

⚠️ **I did not verify the `SetAuthority` instruction's exact account order or data layout** —
confirm it against the `solana-program` `bpf_loader_upgradeable` source before proposing, exactly
as §7.2 did for tag 13. Note the loader has both `bpf_loader_upgradeable::set_authority` (what
`solana program set-upgrade-authority` sends) and the legacy `bpf_loader::set_authority`; you want
the **upgradeable** one, and the accounts differ (program, ProgramData, current authority).

Note the asymmetry: the *rollback* is subject to the same 24 h timelock you just created. A bad
migration therefore costs at least one lock period to undo, and it needs the same M-of-N quorum.
That is by design, but budget for it.

**Rolling back `AdminConfig.admin`** is easier and needs no timelock change: it is just tag 13
again with `8YvdDpW…` at position 4. Same proposal flow, same M-of-N.

### 12.2 The one scenario where rollback is impossible

**If the upgrade authority is set to an address you do not control, the program is permanently
frozen.** There is no recovery path — not by Squads, not by Solana governance, not by anyone.

Precisely why this is the worst outcome in this document:

- The program can never be upgraded again. The current binary is what runs forever.
- **`InitializeAdmin` (tag 13) can never be called again.** It requires account 0 to sign *and* to
  equal the ProgramData authority. If that authority is a key you do not hold, no transaction can
  ever satisfy it.
- Therefore **`AdminConfig.admin` and `AdminConfig.oracle_authority` are frozen forever**, and the
  oracle authority can never be rotated. A later keeper-key compromise becomes unfixable — you
  would be reduced to §11.2's staleness trick permanently, or to abandoning the deployment.

The concrete ways to land in this state:

1. **A mistyped `--new-upgrade-authority`,** especially combined with
   `--skip-new-upgrade-authority-signer-check`, which removes the CLI's "does the new authority
   actually sign?" safety net. This is the single most likely cause. **Check the address
   character by character, twice, against `display-vault` output.**
2. **`--final`.** Setting `--final` marks the program immutable and deletes the authority. There is
   no undo. Never pass `--final` in this migration.
3. **Deriving the vault under the wrong program ID** — the §0.2 trap. A vault derived under
   `…Mjkvj72RbK` is a well-formed address that no program will ever sign for.
4. **A multisig whose members cannot reach threshold** — e.g. all three keys on one machine that is
   lost, or a member who dies or leaves without handing over their key. The vault still exists, but
   no signature can be produced. Treat member key custody as a continuity risk: document who holds
   what, and consider whether any single member's disappearance should be survivable (it is, at
   2-of-3 — which is a real argument for 2-of-3 over 3-of-3).

**Mitigation before you push the button:** do the §5.1 `--sign-only` rehearsal; verify `$VAULT`
three ways (from `display-vault`, by independent PDA derivation, and by eye); and afterwards do not
destroy `8YvdDpW…` until §6 passes cleanly *and* you have deliberately confirmed the vault can
sign by successfully executing a trivial vault transaction.

---

## 13. Verification checklist

Ordered; each step gates the next. "Expected" is what a correct run produces.

| # | Command | Expected |
|---|---|---|
| 1 | `solana-keygen pubkey <authority-keypair>` | `8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds` — **gates everything; see §0.1** |
| 2 | `solana program show 4Dp2A6SH… -u mainnet-beta` | `Authority: 8YvdDpW…`, `Last Deployed In Slot: 451698349` |
| 3 | `solana account 9ikmDTbb… --output json` → decode `[13..45]` | `8YvdDpW…`; `[0..4]==3`; `[12]==1` |
| 4 | `solana account 7tCidaB2… --output json` → decode | `CLK_ADMN`, init `1`, admin `8YvdDpW…`, oracle `HtiDpTkc…`, len 73 |
| 5 | `solana balance 8YvdDpW…` | `0.164731356` SOL |
| 6 | `squads-multisig-cli multisig-create …` | prints multisig address → record as `$MULTISIG` |
| 7 | `squads-multisig-cli display-vault --multisig-address $MULTISIG --vault-index 0` | prints `Vault: $VAULT`; independently re-derive `[b"multisig",$MULTISIG,b"vault",[0]]` and match |
| 8 | `config-transaction-create --action "SetTimeLock 86400"` then vote, then `config-transaction-execute` | multisig account `time_lock == 86400` |
| 9 | `solana program set-upgrade-authority … --sign-only` | a signed message you can inspect; **nothing sent** |
| 10 | `solana program set-upgrade-authority … --skip-new-upgrade-authority-signer-check` (real) | tx confirmed, 1 signer (`8YvdDpW…`), `Set Authority` instruction |
| 11 | `solana program show 4Dp2A6SH…` | `Authority: $VAULT`; ProgramData still `9ikmDTbb…` |
| 12 | re-decode `AdminConfig` | **unchanged**: admin `8YvdDpW…`, oracle `HtiDpTkc…` |
| 13 | Solscan program page | upgrade authority `$VAULT` |
| 14 | Build + propose tag 13 (§7.3), `display-transaction` | program `4Dp2A6SH…`, data `13`, acct 0 = `$VAULT` **signer**, acct 3 = `9ikmDTbb…` |
| 15 | Approve to threshold, wait timelock, execute | tx confirmed |
| 16 | re-decode `AdminConfig` | `admin == $VAULT`, `oracle == HtiDpTkc…` (unchanged) |
| 17 | Sanity: propose tag 14 `WithdrawTreasury` as a vault tx | builds and is executable; `8YvdDpW…` can no longer call it |
| 18 | `solana balance 8YvdDpW…` then sweep | key drained to the residual you chose |
| 19 | `solana balance HtiDpTkc…` | **> 0.05 SOL and alarmed** — §10.4 |
| 20 | Keeper still cranking after cutover | feeds stay < 600 s old; `feed.authority` still the keeper |

---

## 14. Unverified items — do not treat as fact

Stated explicitly rather than guessed, per the brief's "accuracy over completeness".

1. **`--transaction-message` byte format** for `vault-transaction-create`. Declared `Vec<u8>` in
   the published source, passed straight through to `VaultTransactionCreateArgs`. **No format
   documentation found.** §7.4 uses the TS SDK instead.
2. **`config_authority` bypass semantics.** The docs/CLI describe unilateral config control; the
   `config_transaction_execute` source shows member-Execute + timelock with no visible bypass. The
   two disagree. Recommendation (leave it unset) is safe either way.
3. **Squads web app flow.** `app.squads.so` returned HTTP 429 to my probe; I could not verify
   whether it can build a fully-specified raw instruction with per-account signer flags.
4. **Exact `initiate-program-upgrade` / `display-vault` invocation.** I verified these subcommands
   and their flags by reading the **published 0.1.7 crate source**, and inferred their clap names
   from the variant names via clap's default kebab-casing. I did not run `--help` (the crate is not
   installed on this host). Confirm with `squads-multisig-cli --help` before use.
5. **`set_authority` (BPF upgradeable loader) instruction layout** for the §12.1 rollback. Not
   verified in this document; check against the `solana-program` source before proposing.
6. **`PriceFeed` `authority` byte offset** for the §11.1 verification read. Not derived here; read
   it from `PriceFeed`'s field order and `LEN` in `state.rs`.
7. **Exact keeper fee burn.** The cranks/day is verified (3-minute cron); the per-transaction fee
   configuration was not located in the repo. §10.4's runway is a range for that reason — measure
   it from recent transactions.
8. **Rent-exempt cost** of creating Squads proposal/transaction accounts, and whether
   `vault-transaction-accounts-close` reclaims it as expected. Not measured.
9. **Whether the currently-installed `squads-multisig-cli` will match the source read here.** I
   read published 0.1.7 (2025-12-16), the newest release at time of writing. Check
   `cargo install` picks up 0.1.7 and not a newer version with changed flags.

---

## 15. Sources

Verified against these, on 2026-09-29.

**Primary (on chain, mainnet-beta, via `https://api.mainnet-beta.solana.com`)**
- `getAccountInfo` on `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` → executable program account
- `getAccountInfo` on `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj72RbK` → `null` (no account)
- `getAccountInfo` on `4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7`, `9ikmDTbbRhtgYKjRhcnzCK9RpPWQ8uTYUeNJ16kWMLSG`, `7tCidaB2vu5N8KfKJ2Mqfm5dxbkvSqqvxHqkznYveroi`, `4YC4rCNXva8ty6f1pKRC2NX7e5kufqowBYJDCMor12Wu`
- `getBalance` on `8YvdDpW…` and `HtiDpTkc…`

**Squads Protocol v4**
- Program source, `declare_id!` — https://github.com/Squads-Protocol/v4/blob/main/programs/squads_multisig_program/src/lib.rs
- `Multisig` state (`time_lock`, `MAX_TIME_LOCK`, `config_authority`) — https://github.com/Squads-Protocol/v4/blob/main/programs/squads_multisig_program/src/state/multisig.rs
- Seed constants (`SEED_PREFIX`, `SEED_MULTISIG`, `SEED_VAULT`, …) — https://github.com/Squads-Protocol/v4/blob/main/programs/squads_multisig_program/src/state/seeds.rs
- Vault signing seeds and timelock check — https://github.com/Squads-Protocol/v4/blob/main/programs/squads_multisig_program/src/instructions/vault_transaction_execute.rs
- Config execution constraints — https://github.com/Squads-Protocol/v4/blob/main/programs/squads_multisig_program/src/instructions/config_transaction_execute.rs
- `VaultTransaction` state — https://github.com/Squads-Protocol/v4/blob/main/programs/squads_multisig_program/src/state/vault_transaction.rs
- TS SDK PDA derivations — https://github.com/Squads-Protocol/v4/blob/main/sdk/multisig/src/pda.ts
- CLI source (published 0.1.7, downloaded and inspected from crates.io) — https://github.com/Squads-Protocol/v4/tree/main/cli
- CLI README — https://github.com/Squads-Protocol/v4/blob/main/cli/README.md
- Crate metadata — https://crates.io/crates/squads-multisig-cli
- Docs: TypeScript overview / program IDs — https://docs.squads.so/main/development/typescript/overview
- Docs: Create Vault Transaction — https://docs.squads.so/main/development/typescript/instructions/create-vault-transaction.md
- Docs: Create Config Transaction (timelock, staleness gotcha) — https://docs.squads.so/main/development/typescript/instructions/create-config-transaction.md
- TS SDK package — https://www.npmjs.com/package/@sqds/multisig
- Squads app — https://app.squads.so (and https://squads.so)

**ClockLend (this repo)**
- `program/src/processor.rs` — `process_initialize_admin` (1031-1143), `process_set_price_feed` (1145-1345), constants (3836, 3840)
- `program/src/state.rs` — `AdminConfig` (421-425), `LendingPool`
- `program/src/instruction.rs` — instruction enum, variant indices 12/13
- `scripts/rotate-oracle.mjs` — working tag-13 account layout
- `scripts/deposit-liquidity.mjs`, `mobile/scripts/deploy-mainnet.mjs`, `serverless/wrangler.toml`

**Local toolchain**
- `solana-cli 3.1.9` (Agave), `solana program set-upgrade-authority --help` — flag semantics
