# ClockLend — CLOCK IN Demo Video Script (2:30 target)

> **Deck Reference**: Fully aligned slide-by-slide with [`docs/ClockLend_Pitch_Deck_CLOCKIN.pptx`](file:///home/tiktoor/Clock-It/docs/ClockLend_Pitch_Deck_CLOCKIN.pptx)  
> *(14-slide Investor & Hackathon Pitch Deck: "Stake SKR, borrow stablecoin and keep earning while it’s locked")*

---

## ⏱️ Video Structure & Slide Alignment

| Timestamp | Segment Title | Pitch Deck Alignment | Core Message / Action |
| :--- | :--- | :--- | :--- |
| **0:00–0:20** | **The Hook: The Fragility of Small Loans** | **Slides 1 & 2** | One price dip wipes out everyday loans; no social context; mobile gap. |
| **0:20–0:45** | **The Safety Model: ClockLend vs. Kamino/Marginfi** | **Slide 3** | Fixed-term loans with a visible 24h rescue window vs. predatory bot liquidations. |
| **0:45–1:10** | **Live App Walkthrough: 6 Steps to Borrow** | **Slides 4 & 5** | Connect Seeker wallet → Request → Match cheapest desk → Lock collateral → Receive USDC. |
| **1:10–1:30** | **Repay with Confidence & Dual Safety** | **Slides 5 & 6** | Ticking countdown, 1-tap repay, alerts starting at −10%, 65–70% LTV safety. |
| **1:30–1:50** | **Desks, Circles & How ClockLend Makes Money** | **Slides 6, 9 & 10** | Lenders open desks, 85/15 interest split ($6.80/$1.20), 0.25–0.50% start fee, 50% surplus. |
| **1:50–2:10** | **SKR: Stake, Discount, Never Slashed** | **Slide 11** | 1% to 25% APR discount, 50% fee dividends in USDC, locked & never slashed. |
| **2:10–2:30** | **Roadmap, Team & The Ask** | **Slides 12, 13 & 14**| Mainnet verified, 122 tests, 14 rounds, Bughacker & Awajimimin, dApp Store. |

---

## 🎬 Minute-by-Minute Script & Visual Cues

### 0:00–0:20 — THE HOOK: One Price Dip Can Wipe Out a Small Crypto Loan
*Covers Pitch Deck Slide 1 ("ClockLend: Stake SKR, borrow stablecoin...") & Slide 2 ("The Problem")*

- **Visual**: 
  - Over-the-shoulder shot holding the physical Solana Seeker device with the ClockLend home screen open.
  - On-screen text badge: *"SOLANA MOBILE CLOCK IN HACKATHON"*.
- **Voiceover**: 
  > *"A single sudden price dip can wipe out a small crypto loan before you even have time to react. Major protocols are quick to punish, completely blind to trusted social circles or bilateral credit, and built for desktop whales rather than everyday people borrowing on their phones. ClockLend changes that."*

---

### 0:20–0:45 — THE SAFETY MODEL: ClockLend vs. Kamino & Marginfi
*Covers Pitch Deck Slide 3 ("A different safety model from major Solana lenders")*

- **Visual**: 
  - Graphic split-screen overlay comparing the models:
    - **Kamino / Marginfi**: Health threshold drops → Immediate bot liquidation → Collateral seized.
    - **ClockLend**: Loan reaches due time → **24-Hour Rescue Window** → Repay or raise funds before settlement.
- **Voiceover**: 
  > *"Kamino and Marginfi rely on automated health thresholds that trigger instant bot liquidations. ClockLend is built on a fundamentally different safety model: fixed-term loans with a transparent, visible 24-hour rescue window after your due time. All collateral escrows and rescue rules are enforced on-chain by deterministic code, not human discretion."*

---

### 0:45–1:10 — HOW IT WORKS: 6 Steps from Request to Repayment
*Covers Pitch Deck Slide 4 ("See it working") & Slide 5 ("How it works: six steps")*

- **Visual**: 
  - **Step 1 (Connect)**: Tap *"Connect Seeker Wallet"* → 1-tap biometric fingerprint confirmation via Seed Vault (MWA 2.0).
  - **Step 2 (Request)**: Enter $10 USDC borrow amount, select SOL or SKR collateral and duration.
  - **Step 3 (Match)**: Live routing engine matches the lowest-APR available lending desk (Pool #2, 8% APR, 65% LTV). Price updates from the live on-chain keeper feed.
  - **Step 4 (Lock) & Step 5 (Receive)**: Approve Seed Vault transaction → Escrow locks into program PDA atomically → $10 USDC lands in the wallet.
  - Show real on-chain transaction hash on Solscan.
- **Voiceover**: 
  > *"Six steps from request to repayment. You connect with your Seeker Seed Vault, request your amount and collateral, and the router matches you to the best desk. Collateral locks into an atomic on-chain escrow PDA, and stablecoins land in your wallet in seconds. Rules enforced by code, signed by your phone's hardware."*

---

### 1:10–1:30 — REPAY WITH CONFIDENCE: Built to Keep Both Sides Safe
*Covers Pitch Deck Slide 5 (Step 6 "Repay") & Slide 6 ("Built to keep both sides safe")*

- **Visual**: 
  - Camera zooms on the active loan card: show the **Live Ticking Countdown Clock** alongside the **Collateral Health Band**.
  - Show notification banner: *"Collateral health alerts start at −10% and escalate as collateral nears debt."*
  - **Step 6 (Repay)**: One-swipe repayment → Seed Vault sign → Loan status flips to **`Repaid` (Green)** → Collateral instantly unlocked and returned to the wallet.
- **Voiceover**: 
  > *"Every loan carries a clock you can see, so you always know what happens next. If market prices dip, proactive alerts start at minus 10% and escalate well before you reach danger. And when you repay, one swipe releases your collateral immediately back to your wallet. If you're late, the 24-hour grace window opens first — one missed hour isn't the end."*

---

### 1:30–1:50 — LENDING DESKS & HOW CLOCKLEND MAKES MONEY
*Covers Pitch Deck Slide 6 ("If you lend"), Slide 9 ("Our first users") & Slide 10 ("How ClockLend makes money")*

- **Visual**: 
  - Switch to the **Markets / Desks** view:
    - Show live **Genesis Desk #2** (50 USDC, 65% LTV, 8% APR).
    - Show *"Create Desk"*: lenders choosing APR, duration, and 65–70% LTV limit.
  - Fast graphic breakdown of the **$100 loan at 8% interest** example:
    - Principal: $100
    - Interest: +$8 ($108 total repayment)
    - Interest Split: **Lenders keep $6.80 (85%)** | **ClockLend takes $1.20 (15%)**
    - Small start fee: 0.25%–0.50% withheld at disbursement.
    - Default surplus: 50% to protocol, 50% back to borrower.
- **Voiceover**: 
  > *"Lenders stay completely protected: every loan is backed by collateral capped at 65 to 70% LTV, and lenders set their own rates and limits. On an 8% loan, lenders keep 85% of the earned interest — $6.80 on an $8 yield — while ClockLend takes a 15% protocol take-rate and a small 0.25% to 0.50% origination fee. And if a default settles after grace, half of any surplus collateral returns to the borrower."*

---

### 1:50–2:10 — SKR: Stake It, Borrow Cheaper, Keep Earning
*Covers Pitch Deck Slide 11 ("SKR: stake it, borrow cheaper, keep earning")*

- **Visual**: 
  - Open **Credit Profile** → **Stake SKR**.
  - Stake 100 SKR: tier slider moves in real time, showing APR discount sliding from **1% at 100 SKR up to 25% at 10,000 SKR**.
  - Highlight the **USDC Dividend Pool**: 50% of protocol origination fees accumulating for SKR stakers.
  - Emphasize the badge: **"Locked, Never Slashed"**.
- **Voiceover**: 
  > *"SKR is the beating heart of ClockLend. Staking SKR unlocks sliding rate discounts from 1% at 100 SKR up to 25% at 10,000 SKR. 50% of every protocol origination fee funds a USDC dividend pool that SKR stakers claim against. Most importantly: your SKR bond is locked while a loan is live, released upon settlement, and never slashed — your stake keeps earning yield throughout."*

---

### 2:10–2:30 — ROADMAP, TEAM & THE ASK
*Covers Pitch Deck Slides 12 ("Roadmap"), 13 ("Meet the team") & 14 ("Thank you")*

- **Visual**: 
  - Full-screen dashboard overview showing the live Mainnet verified badge.
  - On-screen stat cards:
    - **Live on Solana Mainnet** (Program `4Dp2A6SH...`, Slot `454108434`)
    - **122 Automated Tests** across 6 suites
    - **14 Internal Security Review Rounds**
  - Team graphic: **Bughacker** (Founder · Offensive Security Engineer) & **Awajimimin** (Mobile Engineer · Designer).
  - Closing title card: Logo lockup, GitHub repo (`github.com/luckysitara/ClockLend`), and Website (`clocklend.kikhaus.com`).
- **Voiceover**: 
  > *"ClockLend is live on Solana mainnet today with a bytecode-verified program, 122 automated tests, and 14 security review passes. Built by Bughacker and Awajimimin specifically for the Solana Mobile ecosystem. ClockLend: Stake SKR, borrow stablecoin, and keep earning while it's locked. Thank you."*

---

## 📋 Production Checklist for Recording

1. **Hardware**: Physical Solana Seeker phone (`SM02G40619122247`).
2. **On-Screen Signatures (All Real Mainnet Transactions)**:
   - ① Seed Vault Biometric Unlock & Connect.
   - ② Borrow $10 USDC against SOL on Desk #2.
   - ③ One-Swipe Repay (collateral returned, credit boosted).
   - ④ Stake SKR (tier moves, dividend position updates).
3. **Overlays**: Solscan URLs/QRs for the real borrow and repayment transactions landed today.
4. **Export Format**: 1080p 60fps MP4, length between **2:15 and 2:30**.
