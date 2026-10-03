# ORE Integration — Scope & Options

Context: CLOCK IN submission closes **Oct 8** (5 days). ORE's matched prize doubles a
podium win (1st $30k → $70k) for **one** top ORE-integrated winner, paid in milestones,
with ongoing live-support + marketing obligations. Claiming it requires a *live,
user-facing* ORE integration in the submitted APK.

ORE facts (2026): mining protocol by regolith-labs — deploy SOL to a 5×5 board in
2-minute rounds, claim SOL + newly minted ORE. ORE mint
`oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp` (11 decimals, 5M max supply).
Staking exists (`deposit`/`withdraw`/`claim_yield`). TS SDK: `ore-sdk-core` (npm,
peer-deps `@solana/web3.js` + `@solana/spl-token`; built for web/Next.js — RN
compatibility needs a polyfill check, see below).

---

## Option A — Seeker-native ORE mining terminal (RECOMMENDED, 2–4 days)

**What:** a Hub screen where users deploy SOL to mine ORE, watch the live round
countdown, claim SOL/ORE rewards, and (v1.5) stake mined ORE for yield. All txs
built client-side and signed via Seed Vault — **no ClockLend program changes.**

**Why this is the right shape:**
- Meaningful + user-facing + *mobile-first* — a mining rig in a phone is a story
  no desktop submission can match; it directly extends the "your phone is a bank"
  positioning.
- Zero mainnet program risk (no upgrade, no new oracle, no keeper changes).
- Reuses existing infra: tx building, MWA/Seed Vault signing, validation allowlist
  (add ORE program IDs to `ALLOWED_PROGRAM_IDS`), TransactionNoticeModal.

**Build plan (v1, cuttable):**
1. **SDK compat check (½ day).** Try `ore-sdk-core` under Hermes/RN with the existing
   Buffer polyfills. If it breaks, hand-build the three instructions we need
   (`Deploy`, `ClaimORE`, `ClaimSOL`) from the Rust `ore-api` layouts — ClockLend
   already hand-builds its own program instructions, so this is proven territory.
   Fetch board/round state via RPC `getProgramAccounts` or the SDK's `getBoard()`.
2. **Miner screen (1 day).** 5×5 board grid, round countdown (reuse CountdownTimer),
   SOL deploy amount, selected squares, claim buttons, mined-ORE balance.
3. **Wiring (½ day).** Program ID allowlist, tx build + sign + send through the
   existing `signAndSendSeekerTransaction` path, success/error notices.
4. **Staking-lite (½–1 day, cuttable).** Stake mined ORE, show yield, claim yield —
   if time; otherwise v1.5 post-submission.
5. **Devnet smoke → mainnet demo (½ day).** Mine one real square on mainnet for the
   video.

**Risks:** SDK RN incompat (mitigated by hand-built instructions); ORE account layout
drift (pin layouts against the vendored crate); mining UX needs SOL — a Seeker user
always has some, fine.

---

## Option B — ORE as lending collateral (NOT recommended before Oct 8)

Requires: processor change (ORE mint in the collateral gates beside SOL/SKR),
**mainnet program upgrade** (write-buffer deploy flow, per our ops quirks), a new
global oracle feed PDA for ORE + keeper crank for the ORE price, pool/UI updates, and
re-audit of collateral math. Realistic effort: 5–8 days plus upgrade risk on a live
program with real user funds. Good post-hackathon roadmap item; wrong move for this
deadline.

---

## Option C — ORE reward layer (skip)

Lenders/borrowers earn ORE kickers. Needs an ORE treasury, disbursement logic, and
a program change or a custodial faucet — thin user-facing value for the effort.

---

## Terms-compliance checklist (if we claim the matched prize)

- [ ] ORE feature is **live in the submitted APK** (no mockups, no "coming soon")
- [ ] No competing product is featured in-app (we feature none — pass)
- [ ] Accept milestone-based payouts + progress updates (dev + usage metrics)
- [ ] Commit to ongoing marketing: launches, demos, product content, socials
- [ ] Accept ORE's sole-discretion terms — payment can stop if integration drops

## Recommendation

**Ship Option A v1 (mine + claim) in 2–3 days, stake-lite if time, and claim the
matched prize honestly.** It is the only shape that is both "meaningful" and
5-day-feasible, and it doubles as a genuinely good feature — a mining terminal
reinforces the "hard money, social credit" story. Accept that only ONE team gets
the match: treat it as a leveraged bet, not guaranteed income. If the SDK check
fails and hand-building exceeds day 1, fall back to a strong non-ORE submission
(the main $135k pool + SKR prize remain fully in play).

Sources: [regolith-labs/ore](https://github.com/regolith-labs/ore) ·
[ore SDK usage](https://deepwiki.com/regolith-labs/ore/9.1-sdk-usage) ·
[ore architecture](https://deepwiki.com/regolith-labs/ore/2-architecture)
