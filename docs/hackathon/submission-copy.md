# ClockLend — CLOCK IN Submission Copy

## Form fields

| Field | Copy |
|---|---|
| Project name | **ClockLend** |
| Tagline | Social credit, on-chain — micro-lending & pawns for the Seeker, in your pocket |
| Category | DeFi / Fintech |
| Website | https://clocklend.kikhaus.com |
| Repo | https://github.com/luckysitara/ClockLend |
| APK | (attach `app-debug.apk` from `mobile/android/app/build/outputs/apk/`) |
| Status | **Live on Solana mainnet** — program `4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7`, on-chain oracle feeds, production USDC desks |

## Description (submission body)

ClockLend puts real-world lending on-chain, on the Seeker. DeFi lends to whales with
150%+ collateral and bot liquidations; the informal economy — circles, chit funds,
friends — moves hundreds of billions on pure trust with no records and no security.
ClockLend is the third thing: **social credit with collateral security**.

Three marketplaces, one app:

- **Instant Borrow** — one-tap USDC borrowing against SOL or SKR, priced from a live
  on-chain oracle feed (not an API), auto-routed to the cheapest funded desk.
- **Lending Desks** — merchants and communities deploy escrowed desks with their own
  APR, LTV, and terms. Lenders earn yield on every loan plus the liquidation margin.
- **P2P Pawn Deck** — 1:1 pawn listings; peers fund each other directly.

The settlement layer is human: every loan carries a ticking countdown and a 24-hour
**Social Grace period** where your circle — not a liquidation bot — gets first rights
to rescue. SKR reputation bonds unlock up to a 50% interest-rate discount and USDC
dividend yield from protocol fees.

Built Seeker-native: Seed Vault signing, Mobile Wallet Adapter, hardware-backed
security, dark P2P-first UX. **Live on Solana mainnet today** with verified desks,
real borrows, and an on-chain oracle keeper running on a 3-minute cadence.

## Judging-criteria mapping (for the demo/pitch)

- **Stickiness / PMF**: daily-use loop = stake → discount tier → dividends; borrowers
  return for the grace clock; desk owners return for yield. Addresses the
  ROSCA/chit-fund economy — a real, unmet market.
- **UX**: one-tap borrow, one-swipe repay, countdown widgets, Seed Vault auth.
- **Innovation**: social grace instead of instant liquidation; staked SKR keeps
  earning while locked as collateral; on-chain oracle (not an API) prices every loan.
- **Presentation**: the deck's storyboard (borrow → clock → repay → stake) mirrors
  the live app; mainnet tx hashes shown on screen.

## SKR prize (separate $10k, optional)

ClockLend is **already** the deepest SKR integration in the field: SKR is a first-class
collateral asset, the discount-tier engine (1%–25%, capped 50% with quests), the
dividend currency, and a staking hub — all verified on-chain. Include the stake→tier
sequence from the demo and note it in the submission.

## ORE matched-prize claim (if shipped — see ore-integration-scope.md)

State: *"ClockLend integrates ORE as a first-class asset: a Seeker-native ORE mining
terminal (deploy SOL to the 5×5 board, mine in 2-minute rounds, stake mined ORE for
yield) with all transactions signed by the Seed Vault."* Only claim this if the
feature is live in the submitted APK — the terms require a working, user-facing
integration.
