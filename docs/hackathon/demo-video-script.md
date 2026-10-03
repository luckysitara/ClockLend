# ClockLend — CLOCK IN Demo Video Script (2:30 target)

Judging criteria this script is engineered for:
**stickiness/PMF → UX → innovation → presentation/demo.**

Every on-chain moment shows the real mainnet tx hash on screen (Solscan QR/URL overlay).
Shoot on the Seeker with a second camera on the device screen. No emulators.

---

## 0:00–0:15 — HOOK: the gap (PMF)

- [Device in hand, dark P2P-native UI visible]
- VO: *"DeFi lends to whales with 150% collateral and bot liquidations. The informal economy — circles, chit funds, friends — runs hundreds of billions a year on pure trust. Neither has both trust and security. ClockLend does."*
- [Cut: mainnet badge + "LIVE ON MAINNET" stamp]

## 0:15–0:40 — EXPRESS BORROW (UX, mainnet proof)

- [Seed Vault connect prompt → authorized]
- [Borrow tab → type $10 → live price updates from the on-chain oracle feed — pause on the "Selected Desk" row showing desk name + rate]
- VO: *"One tap. Collateral priced from our live on-chain feed — not an API. Escrow is a real PDA you can verify."*
- [Sign with Seed Vault → show the confirmed signature → Solscan overlay]
- [On-screen: tx hash visible, keep it 3 seconds]

## 0:40–1:00 — THE CLOCK (innovation)

- [Loan screen: ticking countdown, 24h Social Grace label]
- VO: *"The settlement layer is human. Every loan has a ticking clock — and when it matures, a 24-hour grace window where your circle, not a liquidation bot, gets first rights to rescue."*
- [Close-up of countdown updating live]

## 1:00–1:20 — REPAY (UX, full loop)

- [One-swipe repay → "collateral returned" → tx hash on screen]
- VO: *"Repay in one swipe. Collateral comes home. And if you staked SKR as collateral, it never stopped earning your tier discount while locked."*

## 1:20–1:45 — SKR STAKE + TIER (stickiness)

- [Profile → SKR Staking: stake → discount tier moves up live]
- VO: *"Staked SKR compounds: up to a 50% interest-rate discount at the top tier, plus USDC dividend yield from protocol fees. That's the loop that brings users back daily — not a promo banner, the economics themselves."*

## 1:45–2:10 — ORE INTEGRATION (the matched prize)

- [Hub → "ORE Miner" screen: 5×5 board, deploy SOL to squares, live round countdown]
- VO: *"ClockLend also ships a Seeker-native ORE mining terminal. Deploy SOL from the app, mine ORE in 2-minute rounds, stake mined ORE for protocol yield — all signed by your Seed Vault. Your phone isn't just a wallet anymore; it's a rig."*
- [Mine a square → show the deploy tx → show mined ORE balance]

## 2:10–2:30 — CLOSE (presentation)

- [Home screen → stats: active loans, desks, liquidity]
- VO: *"ClockLend: social credit, on-chain. Live on Solana mainnet, built for the Seeker, shipping in the dApp Store. Lend like your circle. Borrow like it's yours."*
- [Logo lockup + URL + repo QR]

---

## Shot-list / production notes

- **2 cameras**: over-the-shoulder device + screen capture (scrcpy at 60fps).
- **Tx-hash overlay**: pre-mint the borrow/repay txs on mainnet before filming; paste the live Solscan URL as an overlay so it's real, not simulated.
- **Total on-chain actions**: connect (0), borrow $10, repay, stake SKR, deploy ORE square = 5 signatures. Rehearse each under 15s.
- **Audio**: voice-over recorded separately; no background music louder than -20dB under VO.
- **One continuous take** for the borrow→clock→repay sequence if possible — judges reward "it actually works" over cuts.
- Export: 1080p, ≤ 3 min, single MP4 (hackathon submission standard).

## ORE segment fallback

If the ORE miner screen isn't shipped by filming day, cut 1:45–2:10 and extend the
stake/tier + desk marketplace sections. Do NOT show a mockup — the terms require a
*live* integration; if it's not live, don't claim the matched prize.
