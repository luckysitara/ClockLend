# ClockLend — Application Specification & User-Flow Source Document

> **Purpose.** A complete description of the ClockLend application — its design system,
> its on-chain system design, every screen, section, control and user-visible string — so
> that a user-flow diagram/document can be produced from it.
>
> **Accuracy note.** Everything here was read out of the source at commit `d7ca71a` plus
> working-tree changes dated 2026-09-29. Where the app's UI and the on-chain program
> disagree, that is called out explicitly, because a user flow built on a claim the chain
> does not honour is a flow that breaks in production. This document describes what the
> system **does**, not what it aspires to.

---

## 1. What ClockLend is

ClockLend is a **peer-to-peer micro-lending and social-pawn protocol on Solana**, aimed at
Solana Seeker hardware. It has two distinct lending mechanisms that share one program:

| Mechanism | Who provides the money | Who sets the terms | Collateral |
| :--- | :--- | :--- | :--- |
| **Merchant Desk (pool)** | A single desk authority deposits USDC into a pool vault | The desk sets APR, LTV, min/max duration at creation | Native SOL or SKR |
| **P2P Pawn (Circle Deck)** | Any peer funds a specific offer 1-on-1 | The borrower creates the offer; a peer chooses to fund it | Native SOL or SKR |

A third subsystem, **SKR staking**, is not lending: it locks SKR to discount the interest
rate. The bond it locks is held for the *duration* of a loan only — it is released on
settlement and **never slashed**, on repayment or on default.

**Status of the deployment (2026-09-29).** Program `4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7`
is live on mainnet-beta and its bytecode matches this repository byte-for-byte. On-chain
footprint: 2 price feeds, 1 admin config, 1 pool holding $50 USDC of the team's own money,
1 SKR yield vault. **Zero loans, zero P2P offers, zero user profiles.** No protocol fee has
ever been collected. The program is **upgradeable by a single key** and **no third-party
audit has been performed**.

---

## 2. System design

### 2.1 Architecture

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  ClockLend mobile app    │        │  Site (Vercel, site/)    │
│  React Native / Expo     │        │  marketing + docs only   │
│  Android (Solana Seeker) │        └──────────────────────────┘
└────────────┬─────────────┘
             │ RPC (Helius → PublicNode → api.mainnet-beta)
             │ MWA / Seeker Seed Vault  ← signing happens on-device
             ▼
┌────────────────────────────────────────────────────────────┐
│  ClockLend program  (native Rust / SBF, no Anchor)         │
│  19 instructions · 11 PDA account types                    │
└───────┬──────────────────────────────────┬─────────────────┘
        │                                  │
        ▼                                  ▼
┌──────────────────┐              ┌──────────────────────────┐
│ SPL Token       │              │ Oracle price feeds       │
│ program         │              │ [b"oracle", mint]        │
└──────────────────┘              └──────────┬───────────────┘
                                             │ written by
                                  ┌──────────▼───────────────┐
                                  │ Keeper (Cloudflare cron  │
                                  │ + GitHub Actions + local)│
                                  └──────────────────────────┘
```

**There is no application backend for money flows.** All balances, prices, loan state and
eligibility are read from chain; all writes are signed transactions. The only server-side
components are the oracle keeper and the site.

**Signing never touches JS.** Key material lives in the Seeker Seed Vault; the app requests
a signature over MWA. The app stores no seed, no private key and no auth token on disk.

### 2.2 On-chain accounts (PDAs)

| Account | Seeds | Size | Holds |
| :--- | :--- | :--- | :--- |
| `LendingPool` | `[b"pool", authority, pool_id]` | 200 B | APR, LTV, durations, name, totals, oracle flags |
| Pool vault | `[b"vault", pool_pda]` | SPL | The pool's liquidity token account |
| `LoanOrder` | `[b"loan", pool_pda, borrower, loan_id]` | 170 B | principal, collateral, interest, due/grace times, status, locked bond |
| Collateral escrow | `[b"escrow", loan_pda]` | SPL / lamports | Locks the borrower's collateral |
| `P2POffer` | `[b"p2p_offer", creator, offer_id]` | 202 B | requested amount, interest, collateral, funder, status |
| P2P escrow | `[b"escrow", p2p_offer_pda]` | SPL / lamports | Locks the pawn collateral |
| `UserProfile` | `[b"profile", user]` | 67 B | staked SKR, locked bond, reputation, loan counters |
| SKR stake escrow | `[b"skr_escrow", user]` | SPL | The staked SKR itself — the single source of truth for a stake |
| `PriceFeed` | `[b"oracle", mint]` or `[b"oracle", pool, mint]` | 98 B | price (micro-USD), decimals, timestamp, authority |
| `AdminConfig` | `[b"admin"]` | 73 B | protocol admin + oracle authority |
| `SkrYieldVault` | `[b"skr_yield_vault", reward_mint]` | 121 B | dividend accumulator (`acc_reward_per_share`) |
| Yield token | `[b"skr_yield_token", reward_mint]` | SPL | The dividend token account |
| `UserYieldPosition` | `[b"skr_yield_user", user, reward_mint]` | 121 B | per-user reward debt and accrual |

### 2.3 The 19 instructions

| # | Instruction | Signer | What it does |
| :--- | :--- | :--- | :--- |
| 0 | `InitializePool` | pool authority | Creates a desk. **Rejects LTV > 7000 bps** and oracle-free pools > 3000 bps. Liquidity mint must be USDC or wrapped SOL. |
| 1 | `DepositLiquidity` | **pool authority only** | Funds the vault. **No third party can supply liquidity** — there is no LP share accounting. |
| 2 | `StakeSKR` | user | Locks SKR; creates the profile on first use. |
| 3 | `BorrowFromPool` | borrower | Locks collateral, disburses `principal − origination fee`. |
| 4 | `CreateP2POffer` | creator | Lists a pawn. **LTV cap 7000 bps.** |
| 5 | `FundP2POffer` | funder | Sends the principal directly funder → creator. |
| 6 | `RepayLoan` | borrower | Repays exactly `principal + interest`; returns collateral. |
| 7 | `TriggerGracePeriod` | borrower or pool authority | Starts the 24 h window. **Not automatic.** |
| 8 | `ClaimDefault` | pool authority / P2P funder | Pays the lender the debt's worth of collateral after grace, splits any surplus with the borrower, and releases the bond. Takes no SKR. |
| 9 | `WithdrawLiquidity` | pool authority | Pulls unborrowed liquidity out. |
| 10 | `CancelP2POffer` | creator | Refunds an unfunded pawn; closes the account. |
| 11 | `UnstakeSKR` | user | Returns SKR, respecting the locked bond. |
| 12 | `SetPriceFeed` | oracle/admin authority | Writes a price. Bounded to ±25% per update, else reverts. |
| 13 | `InitializeAdmin` | upgrade authority | Roots admin in the ProgramData upgrade authority. |
| 14 | `WithdrawTreasury` | admin | Pulls collected fees. |
| 15 | `InitializeSkrYieldVault` | admin | One-time; creates the dividend vault. |
| 16 | `DepositSkrYield` | vault authority | Funds dividends. The **only** path that folds the backlog into share value. |
| 17 | `ClaimSkrYield` | user | Claims dividends, 1 h cooldown. |
| 18 | `WithdrawUnusedYield` | vault authority | Recovers only tokens above `pending_rewards`. |

### 2.4 Money flows and fees (these numbers are what the chain enforces)

| Fee | Rate | Taken when | Split |
| :--- | :--- | :--- | :--- |
| Origination | **25 bps** (SOL collateral) / **50 bps** (SKR collateral) | At disbursement, withheld from principal. Charged on **both** routes to a loan — pool borrow and P2P fund | Pool: 50% treasury / 50% SKR yield vault — **but only if the yield-vault accounts are appended**; otherwise 100% to treasury. P2P: **100% treasury** |
| Interest take-rate | **15%** of interest | On repayment | 100% treasury |
| Liquidation margin | **5%** of seized collateral | On default | 100% treasury |
| Bond slash | **None.** No SKR is taken on default — the lender is made whole from the collateral, so seizing the bond too would punish one default twice. The bond lock is *released* | On default | n/a — the borrower keeps their full stake |

Interest is a **percentage of the principal per 30-day term**, not an annual rate:
`principal × rate_bps × duration_secs / (10_000 × 2_592_000)`. A loan held for the full
30-day maximum therefore costs exactly `rate_bps` of the principal, and shorter terms
prorate linearly — a 3-day loan costs a tenth of a 30-day one. `rate_bps` is capped at
1,000 (10% per 30 days, ≈122% APR). Repayment must equal `principal + interest` exactly —
there is no partial repayment.

**SKR staking discount** — affects the *rate*, never the LTV. It slides continuously:

```
discount_bps = 100 + (available_skr − 100 SKR) × 2400 / (10,000 SKR − 100 SKR)
```

| Available SKR | Interest discount | Bond locked while borrowing |
| :--- | :--- | :--- |
| ≥ 100 SKR | 1% → 5% | 100 SKR |
| ≥ 1,750 SKR | 5% → 10% | 250 SKR |
| ≥ 3,812.5 SKR | 10% → 18% | 500 SKR |
| ≥ 7,112.5 SKR | 18% → 25% | 1,000 SKR |

The bond is flat per band, not a percentage of the stake or the loan, and a borrower whose
available stake cannot cover their band locks only what they have.

### 2.5 Pricing and the oracle

Collateral is valued only from an admin-written `PriceFeed`, never from Pyth or a DEX.
A borrow requires the relevant feed to be **≤ 600 seconds old**; older reverts with
`StaleOraclePrice`. Because the keeper has not been running reliably, **this is the binding
constraint on the whole product**: if the feeds go stale, every borrow and every P2P offer
creation reverts, and the app shows a disabled CTA.

- Global feeds: SOL (`$` price, 9 decimals) and SKR (6 decimals).
- Pool-scoped feeds override global ones when a desk opts in (`has_custom_oracle`).
- `is_oracle_free` pools price from hardcoded baselines (SOL $150, SKR $0.02) and are capped
  at 3000 bps LTV because those baselines go stale.
- Each update is clamped to ±25% of the previous stored price.

### 2.6 Liquidation

There is **no price-based liquidation**. The only path is the clock:

```
Active ──(now ≥ due_time)──► TriggerGracePeriod ──► InGracePeriod
                                                      │ (now ≥ grace_period_expires, +24 h)
                                                      ▼
                                                 ClaimDefault ──► Defaulted
```

`TriggerGracePeriod` must be executed explicitly by the borrower or the pool authority —
nothing triggers it automatically. The borrower can repay at any point while `Active`, and
also while `InGracePeriod` until the window lapses. After that, only `ClaimDefault` resolves
the loan. A consequence worth designing around: **a loan that is past due but never had its
grace period triggered stays `Active` indefinitely** — it can always be repaid, but it can
never be liquidated.

### 2.7 Trust model and what is *not* protected

- **Upgrade authority: one key.** `8YvdDpW…` can replace the program and take every vault.
  Not a multisig. Not timelocked. No code change fixes this.
- **Oracle authority: one key.** Writes both global feeds, bounded per-update but ratchetable
  over many updates.
- **Treasury is admin-withdrawable** at the team's discretion.
- **No third-party audit** has been performed; the 14 "rounds" are internal and AI-assisted.
- **No insurance or reserve mechanism exists** in the program.

---

## 3. Design system

Full token tables, typography scale, spacing, radii, shadows and component conventions
are in the companion document: **[`docs/APP_UI_INVENTORY.md`](APP_UI_INVENTORY.md) §6**.
Headlines:

- **Two themes**, dark and light, in `src/theme/ThemeContext.tsx`. Dark is the intended
  default (`app.json` declares `"userInterfaceStyle": "dark"`), but the provider initialises
  to `useState<ThemeMode>('light')` — **so the app actually opens in light mode** — and the
  choice is not persisted across launches.
- **Brand:** primary `#6366F1` (indigo) dark / `#572DFD` light; accent `#38BDF8` (sky);
  danger `#EF4444`; warning `#F59E0B`. Surfaces: `#0A0D14` background, `#121622` cards.
- **No token scales for type, spacing or radii** — sizes are inline per style. Observed
  conventions: screen titles 18–19 px/900, card titles 14–15 px/800, body 12–13 px,
  captions 10–11 px/700–800, hero numerals 28–52 px/900, tabular numerals for addresses and
  the countdown. Cards use radius 14–16, chips 8–12, modal sheets 28 (top corners only),
  CTAs 16–18 at height 52–56.
- **Flat by default:** only four shadows exist in the entire app.
- **Hard-coded colours outside the theme** that will not respond to the toggle:
  `SecurityLockdownView` (entirely hard-coded dark), `SplashScreenView`, `CircleDeckView`
  (dead), and accent colours in `Header`, `MerchantDesksView`, `LeaderboardModal`,
  `ConnectWalletView`, `ActiveOrdersView`.

---

## 4. Screens, sections and controls

The complete inventory — every gate, tab, modal, control, state and verbatim string — is in
**[`docs/APP_UI_INVENTORY.md`](APP_UI_INVENTORY.md)**. Its structure:

| Section | Contents |
| :--- | :--- |
| §1 | Screen/view inventory — the 4 render gates, main shell, modals, hidden views |
| §2 | Navigation map — state machine, tab bar, full transition list, deep links |
| §3 | **Every user-visible string, verbatim**, grouped by component with file:line |
| §4 | Every interactive control — 12 text inputs, buttons by screen, gestures |
| §5 | States and transitions, and the gating expressions |
| §6 | Design system (tokens, type, spacing, radii, shadows, conventions) |
| §7–8 | Wallet/onboarding flow; dead code and known gaps |

Two findings from that inventory that matter for flow design:

- **There is no NFC implementation.** The `triggerNfcBump` handler is a 1.2 s `setTimeout`
  that shows an alert; no NFC API is called. Any flow drawn through a "tap phones to join a
  circle" step describes a simulation.
- **`CircleDeckView` is dead** — it has no call sites. The live P2P surface is
  `MerchantDesksView` (Desks tab), not the "Circle Deck".

---

## 5. User flows

Flows below are written against what the program actually enforces.

### 5.1 Cold start → first signed transaction

```
Launch
  └─ Splash (logo)
       └─ [if a PIN is set] Security Lock  ── wrong PIN ×N ──► lockout
       │      └─ correct PIN
       └─ Onboarding carousel (3 cards)
              └─ Connect Wallet  ── MWA handshake ──► Seeker Seed Vault
                     └─ Home (tabs + quick-start bar)
                            └─ first action
```
Failure paths the UI must handle: Seed Vault unavailable, user rejects the MWA auth, RPC
unreachable, wrong cluster.

### 5.2 Borrow against a desk (the primary flow)

```
Home → Borrow
  1. Pick collateral asset           SOL or SKR
  2. Approve/attach the price feed   ⚠ borrow is BLOCKED unless that asset's feed is fresh
  3. Enter amount + duration
     ├─ live readout: collateral value, LTV, APR after any staking discount, total due
     └─ blocked if amount > pool.max_ltv_bps × collateral value (cap 7000 bps = 70%)
  4. Review notice modal (amount, collateral, interest, due date, fees)
  5. Sign (Seed Vault)  → tx: BorrowFromPool
  6. Active loan appears in Active Orders with a countdown to due time
```

### 5.3 Repay

```
Active Orders → select loan → Repay
  • amount is fixed = principal + interest (no partial repayment)
  • signs a single RepayLoan tx
  • on success: collateral returns to the wallet, loan marked Repaid, reputation +50
    (capped at 10,000 — a fresh profile gains nothing)
```
Past due, the borrower can still repay while `Active`; once the grace window has been
triggered and expires, repayment reverts and the desk/funder may seize the collateral.

### 5.4 Create and fund a P2P pawn

```
Creator: Pawn Deck → List Asset for Pawn
   ├─ collateral asset (SOL or SKR only), amount
   ├─ requested USDC, offered interest, duration
   ├─ LTV must be ≤ 70% → else the tx reverts
   └─ sign → CreateP2POffer        (collateral moves into escrow)

Funder: Circle Deck → browse open offers → Fund
   ├─ principal moves funder → creator directly
   └─ sign → FundP2POffer          (offer becomes Funded, due_time set)
```
The funder bears the price risk: the offer was priced when it was created, and the funder
may fund it later, at a different price.

### 5.5 Default and liquidation

```
past due_time → TriggerGracePeriod (borrower or desk authority) → 24 h window
   ├─ borrower repays inside the window → collateral returned, bond released
   └─ window lapses → ClaimDefault (desk authority / P2P funder)
         ├─ collateral: the lender is paid only what the debt is worth; any surplus
         │   splits 50/50 between the borrower and the treasury (fallback with no
         │   usable feed: a flat 95% lender / 5% treasury)
         └─ SKR bond released (nothing slashed) → reputation −1000
```

### 5.6 Stake SKR

```
Home → Stake
  ├─ approve the SKR token account + create the stake escrow on first use
  ├─ enter amount → sign StakeSKR
  ├─ effect: interest discount tier applies to the NEXT borrow; 1 h cooldown before
  │          dividends on the new stake can be claimed
  └─ unstake: blocked for any SKR locked as a bond on a live loan
```

### 5.7 Claim yield dividends

```
Home → Yield → Claim
  • requires a stake ≥ 1 h old (cooldown, anti-snipe)
  • payout is clamped to the vault's actual token balance
  • ⚠ the live yield vault has never been funded, so payout is currently zero
```

### 5.8 Create a desk (merchant)

```
Profile / Desks → Create Desk
  ├─ name, type (Individual | Circle), APR, max LTV, min/max duration, initial liquidity
  ├─ LTV options offered by the UI: 50 / 60 / 70 (the program rejects > 7000 bps)
  └─ sign → InitializePool, then DepositLiquidity (authority-only)
```

### 5.9 Deep link

`clocklend://…` opens `MainActivity` (the only exported component) and switches tabs. It
performs no state change and moves no funds.
