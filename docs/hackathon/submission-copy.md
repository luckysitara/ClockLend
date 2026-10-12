# ClockLend — CLOCK IN Submission Copy

## Official CLOCK IN Submission Form (Field-by-Field Answers)

### PROJECT TITLE*
`ClockLend`

### HAS THE TEAM AND/OR THE PROJECT RECEIVED ANY PRIOR FUNDING FROM A VENTURE CAPITAL FIRM OR ANGEL INVESTOR?
`NO`

### HAS YOUR PROJECT BEEN BUILT IN THE LAST 3 MONTHS?
`YES`

### HAVE YOU WON A PREVIOUS HACKATHON WITH THIS PROJECT? IF YES WHICH ONE, IF NO PUT N/A.
`N/A`

### IF PORTING AN EXISTING APPLICATION OVER TO MOBILE, WHAT MAJOR FEATURES OR NEW SIGNIFICANT MOBILE DEVELOPMENT HAVE YOU DONE?
*(Leave blank or enter:)* `N/A - Built natively for mobile from scratch.`

### IF NO, WHAT MAJOR FEATURES OR NEW SIGNIFICANT MOBILE DEVELOPMENT HAVE YOU DONE?
ClockLend was architected and built from the ground up as a native mobile dApp for the Solana Seeker:

1. **Seed Vault & Hardware Security**: Native Mobile Wallet Adapter (MWA 2.0) integration with biometric signing (fingerprint/PIN). Keys never leave the Seeker's secure execution environment. Includes local biometric app locking (`expo-local-authentication`).
2. **Ticking Clock & 24h Social Grace Settlement**: Replaced aggressive MEV bot liquidations with a human-centric countdown timer and a 24-hour Social Grace period where friends or community circles can rescue collateral.
3. **1-Tap Algorithmic Borrow Routing**: Frictionless mobile borrowing that auto-matches with the lowest-rate funded desk without manual pool navigation or slippage configuration.
4. **Sub-Second Performance & Optimistic UI**: Balances deduct and loan statuses update instantaneously upon Seed Vault signature confirmation; heavy RPC re-fetches execute asynchronously. Non-indexed 64-bit uint LE token account fetching completely bypasses public RPC indexer rate-limits.
5. **Seeker-Optimized UX & Design**: Built for one-handed thumb navigation with tactile haptics (`expo-haptics`), in-app modal sheets, and a sleek OLED dark mode tailored to Seeker hardware.
6. **Live on Solana Mainnet**: Program `4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7`, active Genesis USDC desk, live on-chain oracle feeds with a 3-minute automated keeper running on an independent Linux droplet.

### DOES YOUR APPLICATION HAVE AN SKR INTEGRATION? IF SO, HOW?
ClockLend features a deep, end-to-end native SKR integration:

1. **First-Class Collateral Asset**: Borrowers deposit SKR tokens to take out USDC micro-loans, priced in real-time by a live on-chain Jupiter/CoinGecko oracle feed updated every 3 minutes.
2. **Dynamic Reputation Bond & Continuous APR Discount (1%–25%, up to 50% with quests)**: Staking SKR locks an on-chain reputation bond that dynamically discounts interest rates across all loans. Staked SKR continues to earn yield while bonded.
3. **SKR Yield Vault & Dividend Distribution**: Loan origination fees deposit USDC dividends directly into the `SkrYieldVault` PDA (`6tY1CpFg9gr7nXZcgxX8WvBXGgKozd3URXzwFnChQQx4`), allowing SKR stakers to claim passive yield right from their phone.
4. **Seeker Identity & Credit Profile**: Derives `@username.skr` identity, tracks historical on-chain credit scores (capped at 10,000), and records community quest milestones.

### DECK URL*
`https://github.com/luckysitara/ClockLend/raw/master/docs/ClockLend_Pitch_Deck_CLOCKIN.pptx`
*(Or your public Google Drive / Canva / DocSend presentation link)*

### DEMO VIDEO URL*
*(Paste your public YouTube, Loom, or Google Drive link - Max 3 minutes, showing the physical Solana Seeker hardware)*

### REPOSITORY URL*
`https://github.com/luckysitara/ClockLend`

### ANDROID APK URL*
*(Direct download link to your functional APK)*
`https://github.com/luckysitara/ClockLend/releases/download/v1.0/clocklend-v1.0.apk`

---

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

## Mobile Track Evaluation Alignment (Usability, Performance, Mobile-First Design)

- **Usability (Feels Natural on a Phone)**:
  - **Zero Web3 Friction**: One-tap borrow routing automatically matches the cheapest active desk without requiring users to navigate complex pool selectors or calculate slippage.
  - **Human-Centric Social Grace**: Rather than aggressive bot liquidations, loans feature a clear ticking countdown clock and a 24-hour Social Grace period where friends or circles can rescue the loan.
  - **Native In-App Experience**: Zero clumsy web modals or OS popups; custom dark-mode confirmation sheets, tactile haptic feedback (`expo-haptics`), and plain-English error handling.
- **Performance (Blazing Fast Mobile Execution)**:
  - **Instant Optimistic UI**: Balances deduct and loan statuses update instantly upon Seed Vault signature confirmation; heavy RPC re-fetches execute asynchronously in the background.
  - **Direct Non-Indexed ATA Fetching**: Bypasses public RPC indexer rate-limits and HTTP 403 errors by reading raw 64-bit uint LE token balances directly.
  - **Instant Handle Derivation**: Sub-millisecond deterministic profile derivation eliminates blocking RPC calls on launch.
- **Thoughtful Mobile Design (Seeker-Native)**:
  - **Thumb-Zone Navigation**: Primary actions (Borrow, Repay, Stake, Disconnect) are positioned comfortably within bottom-accessible thumb zones.
  - **Seed Vault & MWA 2.0**: Native biometrics and hardware-backed key protection without ever exposing seed phrases.
  - **Deep SKR Integration**: Dynamic tier progression bars, APR discount badges, and on-chain credit scoring visualized cleanly on mobile screens.

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
