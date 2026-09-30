> Companion document to [`docs/APP_SPEC.md`](APP_SPEC.md). This is the exhaustive UI
> inventory — every screen, control and user-visible string — extracted from the source.
> Read this together with the system-design half in APP_SPEC.md.

# ClockLend Mobile — Complete UI Inventory (source material for user-flow design)

**Scope read:** `/home/tiktoor/Clock-It/mobile/` — `App.tsx`, `app.json`, `index.ts`, all 16 files in `src/components/`, `src/theme/ThemeContext.tsx`, `src/types/index.ts`, `src/solana/program.ts`, `src/services/securityService.ts`, `src/services/tardisIntegration.ts`, plus the string-producing helpers in `src/solana/onChainService.ts` and the Android manifest. Read-only; no files were modified.

**All 16 components are covered.** Verified component list: ActiveOrdersView, CircleDeckView, ConnectWalletView, CountdownTimer, CreditProfileView, Header, JudgeBriefingModal, LeaderboardModal, MerchantDesksView, P2PExpressView, QuickStartBar, SecurityLockdownView, SecurityLockScreen, SplashScreenView, TransactionNoticeModal, WalletAssetsModal.

**Cross-cutting accessibility & UX status:** Accessibility labels (`accessibilityLabel`, `accessibilityRole`, and hints) are implemented across the core navigation (Header chips, tab navigation, QuickStart dismiss/presets, Lock Screen keypad, modal dismiss/close buttons). Pull-to-refresh (`RefreshControl`) is wired into Active Loans (`ActiveOrdersView`), P2P Desks (`MerchantDesksView`), and Leaderboard (`LeaderboardModal`). All overlays and modals support Android tap-outside backdrop dismissal and hardware back handling (`onRequestClose`).

---

## 1. Screen / view inventory

### 1.1 Render gates — the four mutually-exclusive top-level screens

`App.tsx` returns early, in this exact order (later gates are unreachable while an earlier one holds):

| # | Gate (App.tsx line) | Component | Condition |
|---|---|---|---|
| 0 | `1221` | `SecurityLockdownView` | `integrity && !integrity.isSecure` — **outranks everything**, including splash and first-run (includes hardware re-check retry) |
| 1 | `1226` | `SplashScreenView` | `showSplash` (initial `true`; tap-to-skip supported) |
| 2 | `1231` | `SecurityLockScreen` | `isLocked` |
| 3 | `1245` | `ConnectWalletView` | `!session` (no wallet) |
| 4 | `1293` | Main app shell | otherwise |

`App` wraps everything in `<ThemeProvider>` (defaults to `'dark'` mode).

### 1.2 Main app shell (gate 4)

| Element | File | Reached by | What the user sees / does |
|---|---|---|---|
| `Header` | `Header.tsx` | always | Avatar+handle (tap → Account tab), sparkles chip (→ Judge Briefing), trophy chip (→ Leaderboard), theme toggle, wallet chip (→ Assets modal). All icon chips carry accessibility labels. When the Account tab is active the left slot becomes the static title `Seeker Account` / `Identity & Credit Profile`. |
| `QuickStartBar` | `QuickStartBar.tsx` | `session && showQuickStart && (activeTab === 'BORROW' \|\| 'MARKET')` | Dismissible first-run guided bar: grace-shield badge, three one-tap borrow presets, X to dismiss (all accessible). |
| **Borrow** tab | `P2PExpressView.tsx` | tab bar / deep link / QuickStart preset | Hero USDC amount field, collateral selector, duration chips, live APR/interest/liquidity metrics, origination-fee disclosure, `⚡ Instant Borrow` CTA. |
| **P2P Desks** tab | `MerchantDesksView.tsx` | tab bar / deep link | Two sub-tabs: `Lending Desks` (desk cards, borrow/fund, create-desk modal) and `P2P Pawns` (filter chips, pawn cards, fund/repay/cancel/share, new-pawn modal). Includes pull-to-refresh. |
| **Active Loans** tab | `ActiveOrdersView.tsx` | tab bar / deep link / post-borrow auto-switch | Loan cards with status badge, countdown, informational ratio bar, cost breakdown, on-chain evidence, repay / grace / TARDIS-rescue actions. Includes pull-to-refresh. |
| **Account** tab | `CreditProfileView.tsx` | tab bar / deep link / header avatar / post-logout | Identity passport card, SKR staking desk, wallet holdings summary, security/biometrics toggles, SKR yield card, hardware-security rows, logout, Hall-of-Fame button. |
| Bottom tab bar | `App.tsx` | always | 4 tabs: `Borrow` (flash), `P2P Desks` (storefront), `Active Loans` (receipt + count badge), `Account` (person-circle). |
| Toast | `App.tsx` | `showToast()`; auto-clears after 2800 ms | Floating pill, bottom 84, checkmark-circle icon + message. |

### 1.3 Modals (all overlay the main shell)

| Modal | File | Opened by | Presentation |
|---|---|---|---|
| `WalletAssetsModal` | `WalletAssetsModal.tsx` | Header wallet chip, Account tab's `View & Manage Wallet Assets →` | `transparent`, `animationType="slide"`, bottom sheet. Backdrop-dismissable; close X button + Android back (`onRequestClose`). |
| `TransactionNoticeModal` | `TransactionNoticeModal.tsx` | any `setTransactionNotice(...)` — every borrow/repay/grace/pawn/stake/claim/deposit outcome | `transparent`, `animationType="fade"`, centred card, maxHeight 85%. Backdrop-dismissable; top-right close X button + action buttons + Android back. |
| `LeaderboardModal` | `LeaderboardModal.tsx` | Header trophy chip, Account tab's `View Global Seeker Hall of Fame →` | `transparent`, `animationType="slide"`, bottom sheet, height 88%. Pull-to-refresh + backdrop-dismissable; X button + Android back. |
| `JudgeBriefingModal` | `JudgeBriefingModal.tsx` | Header sparkles chip **only** | `transparent`, `animationType="slide"`, bottom sheet, height 90%. Backdrop-dismissable; X button + `Back to Live App` + Android back. |
| Create Desk modal | inside `MerchantDesksView.tsx` | `+ Create Desk` chip, `+ Create Lending Desk` empty-state button | `transparent`, `animationType="slide"`. Backdrop-dismissable; `Cancel` / `🚀 Deploy Desk`. |
| NFC modal | `MerchantDesksView.tsx` | `📡 NFC (Soon)` chip | `transparent`, `animationType="fade"`. `Close` only; its only action button is `disabled={true}` with no `onPress`. |
| Create Pawn modal | `MerchantDesksView.tsx` | `+ New Pawn`, `+ List First Pawn` | `transparent`, `animationType="slide"`. Backdrop-dismissable; `Cancel` / `Lock Collateral & List on Solana`. |
| Create Pawn Card modal | `CircleDeckView.tsx` | **unreachable** — see §8 | `transparent`, `animationType="slide"`, **no `onRequestClose`** (Android back does not close it). |

### 1.4 Hidden / conditional views

| View | File | Trigger | Notes |
|---|---|---|---|
| Splash | `SplashScreenView.tsx` | cold start (`showSplash`, initial `true`) | **Zero text.** One logo image, animated: fade-in 600 ms, spring scale 0.88→1, hold 1500 ms, fade-out 350 ms, then `onFinish()`. ≈2.45 s total. No tap-to-skip. Background hard-coded `#0A0D14` (does not use theme). |
| Security lock | `SecurityLockScreen.tsx` | `isLocked`; set at launch if `isLockEnabled()`, on app resume (`AppState` → `'active'`) unless unlocked within the last 90 s, or from `Lock Now` / PIN setup/change | Three modes: `unlock`, `setup`, `change_pin`. Custom numeric keypad, 4 dots, biometric key, backspace, Cancel (only when `onCancel` passed). |
| Hardware lockdown | `SecurityLockdownView.tsx` | `integrity && !integrity.isSecure` | Four diagnostic rows, advisory paragraph, single `Terminate Application`. No retry, no dismiss, no navigation out. Android-only in practice (non-Android returns `isSecure: true`). |
| Onboarding carousel | inside `ConnectWalletView.tsx` | `!session` | 4 swipeable slides (FlatList, paging) + pagination dots. Slide 4 is an interactive pre-auth borrow calculator. |
| QuickStartBar | `QuickStartBar.tsx` | see above | Shown once per device via `SecureStore` key `clocklend_quickstart_dismissed_v1`; defaults to **shown** on storage-read error. |
| Toast | `App.tsx` | deep links + logout + yield claim | 2800 ms auto-dismiss. |
| `CircleDeckView` | `CircleDeckView.tsx` | **nothing** | **Dead code — no importers repo-wide.** See §8. |

---

## 2. Navigation map

### 2.1 Top-level state machine

```
App (ThemeProvider)
└─ MainApp
   ├─ [0] integrity && !integrity.isSecure ──────────► SecurityLockdownView
   │        └─ only action: Terminate Application ──► (native kill; no-op on iOS/web)
   ├─ [1] showSplash ─────────────────────────────────► SplashScreenView
   │        └─ onFinish(): setShowSplash(false) ────► falls through
   ├─ [2] isLocked ───────────────────────────────────► SecurityLockScreen (mode = lockScreenMode)
   │        ├─ onUnlock(): lastUnlockAtRef = now; setIsLocked(false)
   │        └─ onCancel() [only when mode !== 'unlock']: setIsLocked(false)
   ├─ [3] !session ───────────────────────────────────► ConnectWalletView
   │        └─ onConnected(session) ─────────────────► setSession → main shell
   └─ [4] MAIN SHELL
        ├─ Header
        ├─ QuickStartBar   (only on BORROW/MARKET tabs)
        ├─ body: activeTab ∈ { BORROW | MARKET | LOANS | PROFILE }
        ├─ tab bar
        └─ modals: WalletAssets / TransactionNotice / Leaderboard / JudgeBriefing
```

`activeTab` initial value: `'BORROW'` (`App.tsx:92`). `showSplash` initial `true`. `isLocked` initial `false`. `lockScreenMode` initial `'unlock'`.

### 2.2 Tab bar (App.tsx:1393–1484)

| Label (verbatim) | Icon (inactive → active) | Sets | Badge |
|---|---|---|---|
| `Borrow` | `flash-outline` → `flash` | `BORROW` | — |
| `P2P Desks` | `storefront-outline` → `storefront` | `MARKET` | — |
| `Active Loans` | `receipt-outline` → `receipt` | `LOANS` | count, when `activeCount > 0` |
| `Account` | `person-circle-outline` → `person-circle` | `PROFILE` | — |

`activeCount` = orders whose status contains `ACTIVE` or `GRACE` (App.tsx:1267). Active tab styling: icon + label `colors.primary`, label `fontWeight: '800'`; inactive: `colors.textSecondary`. Badge background `colors.accent`, white 10px/900 text, 16×16 circle at top −2 / right −8.

### 2.3 Complete transition list

**Into a tab:**
- tab bar press (all four)
- deep link (below)
- `Header` avatar → `PROFILE`
- `QuickStartBar` preset → `BORROW` (+ `borrowPreset` set, which remounts P2PExpressView via `key`)
- `QuickStartBar` `⚡ Express Borrow` → `BORROW`; `🤝 Community Desks` and `🎴 Pawn Cards` → `MARKET` (both identical)
- `MerchantDesksView` `Borrow from this Desk →` → `onSelectPool` → `BORROW` (App.tsx:1339)
- successful borrow → `LOANS` (App.tsx:514)
- `TransactionNoticeModal` secondary on a borrow notice (`Go to Loans`) → `LOANS` (App.tsx:510)
- `ActiveOrdersView` `⚡ Go to Borrow Desk` → `BORROW` (App.tsx:1359)

**Out of the app:**
- `Linking.openURL` to Solscan — tx (`https://solscan.io/tx/<sig>`), account (`https://solscan.io/account/<addr>`), program (`https://explorer.solana.com/address/<PROGRAM_ID>`)
- `tardisapp://post?content=…`, `tardisapp://dm/<handle>`, `tardisapp://community/<id>` — falls back to the native `Share.share` sheet (share) or an `Alert` (DM / community)

**Modal open/close matrix:**

| Modal | Opens from | Closes via |
|---|---|---|
| WalletAssetsModal | Header wallet chip; Account `View & Manage Wallet Assets →` | `✕`, Android back. Also force-closed by `handleDisconnect` (App.tsx:355). |
| TransactionNoticeModal | 30+ `setTransactionNotice` call sites | Primary button, secondary button (always closes), Android back |
| LeaderboardModal | Header trophy chip; Account `View Global Seeker Hall of Fame →` | `✕`, Android back |
| JudgeBriefingModal | Header sparkles chip | `✕`, `Back to Live App`, Android back |
| Create Desk / NFC / Create Pawn | MerchantDesksView controls | their own Cancel/Close buttons; Android back works on Create Desk + Create Pawn (they have `onRequestClose`? — the file sets `visible`/`animationType`; NFC and Create Pawn close only via their buttons) |

**Lock/unlock transitions:**
- `PROFILE` → `Lock Now` → `setLockScreenMode('unlock'); setIsLocked(true)`
- `PROFILE` → `Set Custom PIN` / turning the master lock on with no PIN → `setLockScreenMode('setup'); setIsLocked(true)`
- `PROFILE` → `Change PIN` → `setLockScreenMode('change_pin'); setIsLocked(true)`
- App resume from background → `checkAppResumeLock()` → lock if enabled and last unlock > 90 s ago

### 2.4 Deep-link handling

Scheme `clocklend` (app.json `"scheme": "clocklend"`); Android manifest declares an `intent-filter` for `android:scheme="clocklend"` with `VIEW`/`DEFAULT`/`BROWSABLE`, `launchMode="singleTask"`. Handled in `App.tsx:166–205` via `Linking.getInitialURL()` (cold start) and the `url` event (warm). Parsing: strips `clocklend://`, splits on `?`, splits path on `/`, lowercases segment 0 as `action`, segment 1 as `targetId`.

| URL | Effect | Toast (verbatim) |
|---|---|---|
| `clocklend://circle/{id}` · `clocklend://pool/{id}` | `setActiveTab('MARKET')` | `Opened Community Circle #{id}` / `Opened Community Desks` (no id) |
| `clocklend://pawn/{id}` · `clocklend://pawns/{id}` | `setActiveTab('MARKET')` | `Viewing P2P Pawn #{id}` / `Viewing Pawn Deck` (no id) |
| `clocklend://borrow` | `setActiveTab('BORROW')` | `Instant Express Borrow Desk` |
| `clocklend://loans` · `clocklend://orders` | `setActiveTab('LOANS')` | `Viewing Active Loan Orders` |
| `clocklend://profile` · `clocklend://account` | `setActiveTab('PROFILE')` | *(none)* |
| anything else | **no-op** — there is no `else` branch; unmatched actions are silently ignored | — |

Parse errors only `console.warn('[DeepLink] Parse error:', e)` — no user-visible feedback.

Note the deep-link handler sets the tab **only**; it does not open, scroll to, or highlight the `{id}` it names. It also runs regardless of session state — a link arriving before wallet connect just sets `activeTab` behind `ConnectWalletView`.

---

## 3. Every user-visible string, verbatim

Grouped by screen/component with file and line. Emoji, capitalisation and punctuation are preserved exactly as in source. Template literals are shown with `${…}` in place; the rendered result is noted where useful.

### 3.1 App shell — `App.tsx`

| Line | Exact string | Purpose |
|---|---|---|
| 189 | `Opened Community Circle #${targetId}` | Deep-link toast |
| 189 | `Opened Community Desks` | Deep-link toast |
| 192 | `Viewing P2P Pawn #${targetId}` | Deep-link toast |
| 192 | `Viewing Pawn Deck` | Deep-link toast |
| 195 | `Instant Express Borrow Desk` | Deep-link toast |
| 198 | `Viewing Active Loan Orders` | Deep-link toast |
| 374 | `Logged out of ${handle}` | Logout toast; `handle` = `@skrHandle` or the literal `wallet` |
| 1062 | `Yield claimed on-chain` | Success toast |
| 1411, 1432, 1460, 1481 | `Borrow` · `P2P Desks` · `Active Loans` · `Account` | Tab labels |

**`setTransactionNotice` payloads in App.tsx** (all titles/subtitles verbatim — these are what `TransactionNoticeModal` renders):

| Line | type | title | subtitle |
|---|---|---|---|
| 390–396 | error | `This Pool Has No Liquidity Yet` | `This desk currently has $${pool.totalLiquidity.toLocaleString()} USDC of liquidity, which is less than the $${borrowAmount.toLocaleString()} requested. Try a smaller amount or another desk.` **or** `This desk has not been funded by its authority yet, so there is nothing to borrow. Pick another desk or check back later.` — button `Dismiss` |
| 501–508 | borrow | `Loan Disbursed on Solana!` | `Received $${formatUsdcMicro(origination.netMicro)} USDC (gross $${formatUsdcMicro(principalMicro)} less the ${feePct}% origination fee of $${formatUsdcMicro(origination.feeMicro)}) with ${collateralUnits} ${collateralName} locked in escrow. Interest due at maturity: $${formatUsdcMicro(interestMicro)} USDC.` — buttons `View on Solscan ↗` / `Go to Loans` |
| 520 | error | `Borrow Cancelled` | `Transaction was cancelled in your wallet.` — `Dismiss` |
| 527 | error | `Transaction Notice` | `describeTransactionError(err)` (see §3.14) — `Dismiss` |
| 549 | error | `Pool Authority Not Found` | `Could not determine pool authority for Pool #${order.poolId}.` — `Dismiss` |
| 613 | repay | `Loan Repaid & Released!` | `Successfully repaid $${totalDue} USDC. Your ${order.collateralName} has been unlocked from escrow back to your wallet. Loan completed — your on-chain credit profile was updated.` — `View on Solscan ↗` / `Done` |
| 631 | error | `Repay Cancelled` | `Transaction was cancelled in your wallet.` — `Dismiss` |
| 640 | error | `Repay Notice` | `err?.message \|\| 'Repayment failed. Please check your balance and try again.'` — `Dismiss` |
| 677 | grace | `Social Grace Activated On-Chain` | `24-hour grace window started on-chain. Circle peers have priority buyout rights before any liquidation.` — `View on Solscan ↗` / `Understood` |
| 691 | error | `Grace Period Not Activated` | `err?.message \|\| 'Could not start the grace period on-chain.'` — `Dismiss` |
| 764 | borrow | `P2P Pawn Listed On-Chain!` | `Asset "${name}" escrowed. Open for peer funding on Circle Deck.` — `View on Solscan ↗` / `View P2P Desks` |
| 777 | error | `Listing Cancelled` | `Transaction was cancelled in your wallet.` — `Dismiss` |
| 786 | error | `Listing Notice` | `err?.message \|\| 'Failed to list pawn offer on-chain.'` — `Dismiss` |
| 847 | repay | `P2P Pawn Funded!` | `Funded $${targetOffer.requestedAmount} USDC for Pawn #${offerId}. You will receive +$${targetOffer.interestOffered} USDC yield upon borrower repayment.` — `View on Solscan ↗` / `Done` |
| 859 | error | `Funding Cancelled` | `Transaction was cancelled in your wallet.` — `Dismiss` |
| 868 | error | `Funding Notice` | `err?.message \|\| 'Failed to fund pawn offer on-chain.'` — `Dismiss` |
| 903 | repay | `Pawn Repaid & Collateral Unlocked!` | `Repaid $${totalDue} USDC. Your ${offer.collateralName} has been unlocked from the Escrow PDA and returned to your wallet.` — `View on Solscan ↗` / `Done` |
| 916 | error | `Repayment Cancelled` | `Transaction was cancelled in your wallet.` — `Dismiss` |
| 925 | error | `Repayment Notice` | `err?.message \|\| 'Failed to complete pawn repayment.'` — `Dismiss` |
| 955 | success | `Pawn Cancelled` | `Your ${offer.collateralName} has been unlocked from escrow back to your wallet.` — `View on Solscan ↗` / `Done` |
| 970 | error | `Cancel Notice` | `err?.message \|\| 'Failed to cancel pawn offer.'` — `Dismiss` |
| 1016 | borrow | `Lending Desk Initialized!` | `"${name}" (${poolType}) is now live on Solana. Fund it from the Fund Desk screen before borrowers can draw.` — `View on Solscan ↗` / `Dismiss` |
| 1030 | error | `Initialization Cancelled` | `Transaction was cancelled in your wallet.` — `Dismiss` |
| 1039 | error | `Initialization Notice` | `err?.message \|\| 'Could not initialize pool on-chain.'` — `Dismiss` |
| 1073 | error | `Yield Claim Notice` | `The 1-hour stake cooldown is still active. Try again later.` (on `Custom(38)` / `0x26` / `cooldown`) else `err?.message \|\| 'Could not claim yield on-chain.'` — `Dismiss` |
| 1098 | borrow | `💎 SKR Reputation Bond Staked!` | `Staked ${amount.toLocaleString()} SKR into Protocol Escrow (${escrowPDA.toBase58().slice(0,8)}...). On-chain APR discount now ${freshProfile.aprDiscount}% (${freshProfile.availableSkr.toLocaleString()} SKR available).` — `View on Solscan ↗` / `Done` |
| 1112 | error | `Staking Cancelled` | `Transaction was cancelled in your wallet.` — `Dismiss` |
| 1121 | error | `Staking Notice` | `err?.message \|\| 'Could not complete SKR reputation bond on-chain.'` — `Dismiss` |
| 1145 | repay | `💧 Desk Funded!` | `Deposited $${amount.toLocaleString()} USDC into "${pool.name}". Borrowers can now draw against your desk.` — `View on Solscan ↗` / `Done` |
| 1158 | error | `Deposit Cancelled` | `Transaction was cancelled in your wallet.` — `Dismiss` |
| 1167 | error | `Deposit Notice` | `err?.message \|\| 'Could not deposit liquidity on-chain. Only the desk owner can fund a desk.'` — `Dismiss` |
| 1191 | repay | `↩️ SKR Unstaked!` | `${amount.toLocaleString()} SKR returned to your wallet from the reputation escrow (${escrowPDA.toBase58().slice(0,8)}...).` — `View on Solscan ↗` / `Done` |
| 1204 | error | `Unstake Cancelled` | `Transaction was cancelled in your wallet.` — `Dismiss` |
| 1213 | error | `Unstake Notice` | `err?.message \|\| 'Could not unstake SKR on-chain. Note: SKR locked by active loans cannot be unstaked.'` — `Dismiss` |

Also `App.tsx:801`: `Alert.alert('Offer Unavailable', 'This pawn offer is already funded or closed.')` — fired when funding a non-`Open` offer.

**The single most reusable failure branch:** `X Cancelled` / `Transaction was cancelled in your wallet.` recurs at lines 520, 631, 777, 859, 916, 1030, 1112, 1158, 1204 for every user-rejected wallet signature (with type `error` and button `Dismiss`).

### 3.2 Splash — `SplashScreenView.tsx`

**No user-visible strings at all.** One `<Image source={require('../../assets/logo.png')}>` at line 62, sized `width*0.32` square.

### 3.3 Security lock — `SecurityLockScreen.tsx`

| Line | Exact string | Purpose |
|---|---|---|
| 81 | `Device temporarily locked. Retry in ${remaining}s.` | Error on init when a persisted lockout is active |
| 125 | `Unlock ClockLend with Biometrics` | OS biometric prompt message (`promptMessage`) |
| 159 | `Device temporarily locked. Retry in ${lockoutSeconds}s.` | Error if a 4th digit lands during lockout |
| 176 | `Too many incorrect attempts. Locked for ${remainingSeconds}s.` | Error when a failed attempt trips the lockout (30 or 300) |
| 178 | `Incorrect PIN. Please try again.` | Unlock failure, no lockout |
| 196 | `PINs do not match. Please try again.` | setup / `confirm_new` mismatch |
| 212 | `Current PIN incorrect.` | change_pin / `enter_current` failure |
| 226 | `PINs do not match. Try again.` | change_pin / `confirm_new` mismatch (**note: shorter than the setup variant — no "Please")** |
| 246 | `ClockLend Security` | Header title, unlock mode |
| 248 | `Confirm Your PIN` · `Create 4-Digit PIN` | Header, setup + `confirm_new` / setup otherwise |
| 251, 252, 253 | `Enter Current PIN` · `Confirm New PIN` · `Enter New 4-Digit PIN` | Header, change_pin modes |
| 255 | `Security Verification` | Fallback header title (unreachable in practice) |
| 261 | `Use Fingerprint / Face ID or enter your PIN` | Subtitle, unlock + biometrics active |
| 262 | `Enter your 4-digit PIN to access ClockLend` | Subtitle, unlock without biometrics |
| 266 | `Re-enter your 4-digit PIN to confirm` | Subtitle, setup/`confirm_new` |
| 267 | `Choose a personal 4-digit PIN for device security` | Subtitle, setup otherwise |
| 270, 271, 272 | `Enter your existing security PIN to continue` · `Re-enter your new PIN to confirm change` · `Enter your new 4-digit security PIN` | Subtitles, change_pin steps |
| 283 | `Cancel` | Top-left button (rendered only when `onCancel` is passed) |
| 300 | `PIN: Active` | Method badge (Ionicons `key`) |
| 323 | `Biometrics: Active (2/2)` / `Biometrics: Off` | Method badge |
| 359–361, 396 | `1` `2` `3` `4` `5` `6` `7` `8` `9` `0` | Keypad digits |

### 3.4 Hardware lockdown — `SecurityLockdownView.tsx`

| Line | Exact string | Purpose |
|---|---|---|
| 24 | `SECURITY VIOLATION` | Heading |
| 26 | `{integrity.violationReason \|\| 'Virtualized or Compromised Runtime'}` | Subtitle |
| 38 | `Physical Device Hardware` | Diag row 1 |
| 41 | `FAIL (Emulator)` / `PASS` | Row 1 status |
| 54 | `OS Integrity (Anti-Root)` | Diag row 2 |
| 57 | `FAIL (Rooted)` / `PASS` | Row 2 status |
| 70 | `Runtime Hooking (Anti-Frida)` | Diag row 3 |
| 73 | `FAIL (Injected)` / `PASS` | Row 3 status |
| 86 | `Process Debugger` | Diag row 4 |
| 89 | `FAIL (Attached)` / `PASS` | Row 4 status |
| 97–99 | `ClockLend is cryptographically locked to physical hardware (Solana Seeker). To protect escrow contracts, borrower collateral, and private key safety, execution is barred on virtualized simulators and tampered operating systems.` | Policy advisory paragraph |
| 109 | `Terminate Application` | Exit button |

`violationReason` values from `securityService.ts`: `Virtualized Environment (Simulator / Emulator) Detected` (313), `Compromised Operating System (Root / Jailbreak) Detected` (315), `Dynamic Instrumentation (Frida / Hooking) Detected` (317), `Unauthorized Debugger Attached` (319), `Device integrity check failed unexpectedly (Fail closed)` (338).

### 3.5 Header — `Header.tsx`

| Line | Exact string | Purpose |
|---|---|---|
| 38 | `Seeker Account` | Title when the Account tab is active |
| 39 | `Identity & Credit Profile` | Subtitle, same |
| 48 | `{skrHandle}` | Handle in the profile button (data). `solBalance` is a required prop but **never rendered**. |

No other text; four icon-only chips. Unused style remnants (`avatarText`, `subtext`, `themeIcon`, `walletIcon`) remain defined.

### 3.6 Quick-start bar — `QuickStartBar.tsx`

| Line | Exact string | Purpose |
|---|---|---|
| 44 | `24H GRACE SHIELD · NO INSTANT LIQUIDATION` | Green badge (`·` = U+00B7), Ionicons `shield-checkmark` |
| 53 | `QUICK START · BORROW IN ONE TAP` | Section label |
| 15 + 62 | `Borrow $10` · `Borrow $25` · `Borrow $50` | Preset chips (`PRESET_AMOUNTS = ['10','25','50']`) |
| 74 | `⚡ Express Borrow` | Feature pill |
| 81 | `🤝 Community Desks` | Feature pill |
| 88 | `🎴 Pawn Cards` | Feature pill |

### 3.7 Borrow tab — `P2PExpressView.tsx`

| Line | Exact string | Purpose |
|---|---|---|
| 213 | `BEST AVAILABLE ROUTE` | Live-pulse badge |
| 217 | `P2P EXPRESS BORROW` | Hero eyebrow |
| 219 | `$` | Currency prefix |
| 225 | `0` | **placeholder** of the hero amount `TextInput` |
| 228 | `USDC` | Currency suffix |
| 254 | `$25` · `$50` · `$100` · `$250` | Preset chips (`['25','50','100','250']`) |
| 264 | `COLLATERAL TO ESCROW` | Section header |
| 275 | `BORROW MAX` | Max badge button (only when `userBalance > 0`) |
| 286 | `Stake for yield` | SKR chip subtitle |
| 290, 291 | `SOL` · `SKR` | Collateral chip labels |
| 292 | `${solBalance.toFixed(2)} avail` | SOL chip subtitle |
| 326 | `Required Escrow Deposit` | Calc label |
| 335 | `${requiredCollateralUnits.toFixed(isDecimal ? 3 : 0)} ${collateralType}` | Required escrow value |
| 336 | `—` | Em dash when required collateral is 0 |
| 341 | `Wallet Holdings` | Calc sub-label |
| 349 | `${userBalance.toFixed(isDecimal ? 2 : 0)} ${collateralType}` | Holdings value (danger colour when insufficient) |
| 359 | `🔒 Escrowed SKR earns nothing in escrow — stake SKR in your Profile to earn protocol-fee dividends.` | SKR yield banner |
| 363 | `🔓 SOL in escrow is released on repayment. No yield accrues to escrowed collateral.` | SOL yield banner |
| 378 | `Need ${…} {collateralType}, you hold ${…} {collateralType}` | Red insufficient-collateral warning |
| 387 | `Use SOL Instead` | Escape-hatch button |
| 396 | `LOAN DURATION` | Section header |
| 419 | `3 Days` · `7 Days` · `14 Days` · `30 Days` | Duration chips |
| 435 | `No lending desks found yet` / `This pool has no liquidity yet` | Empty route-card title |
| 439 | `No on-chain lending desk was found for this network. Create one from the Market tab to get started.` | Empty body (no pools) |
| 440 | `No desk is currently funded, so there is nothing to borrow. Fund a desk from the Market tab, or check back after a desk authority deposits liquidity.` | Empty body (unfunded) |
| 449 | `Discovering Pools...` / `{bestPool?.name}` / `No lending pools available` | Route card title |
| 452 | `{effectiveApr.toFixed(1)}% APR` | APR pill |
| 458, 462, 466 | `Interest Due` · `Grace Period` · `Desk Liquidity` | Metric labels |
| 459 | `${estInterest.toFixed(3)}` | Interest metric |
| 463 | `+24h Social` | Grace metric |
| 473 | `$${poolLiquidity.toLocaleString()}` / `—` | Liquidity metric |
| 480 | `SKR Bond Tier (on-chain)` | Bond-tier metric label |
| 482 | `Tier 2 · 50% APR discount` / `Tier 1 · 25% APR discount` / `No SKR bond · 0% APR discount` | via `tierDiscountLabel()` |
| 486–487 | `{lockedSkr.toLocaleString()} SKR bonded to active loans: {availableSkr.toLocaleString()} SKR counts toward the tier.` | Bond caption (when `lockedSkr > 0`) |
| 488 | ` Rate ${baseApr.toFixed(2)}% → ${effectiveApr.toFixed(2)}% APR.` (leading space) | Rate-change suffix; `''` when discount is 0 |
| 497 | `Origination fee {(origination.feeBps / 100).toFixed(2)}% ({collateralType} collateral)` | Fee disclosure |
| 500 | `-${formatUsdcMicro(origination.feeMicro)} USDC` | Fee amount (danger) |
| 504 | `You receive` | Net label |
| 506 | `${formatUsdcMicro(origination.netMicro)} USDC` | Net amount |
| 535 | `This Pool Has No Liquidity Yet` | CTA label variant |
| 537 | `Exceeds Desk Liquidity ($${poolLiquidity.toLocaleString()})` | CTA label variant |
| 539 | `Insufficient ${collateralType} Collateral` | CTA label variant |
| 541 | `Awaiting Live Price Feed...` | CTA label variant |
| 542 | `⚡ Instant Borrow $${numAmount > 0 ? numAmount : 0} USDC` | Default CTA label |
| 547 | `Atomic Escrow • Non-Custodial • Instant Settlement` | Disclaimer caption |

`Alert.alert` calls — 155 `Invalid Amount` / `Please enter a valid loan amount.`; 160 `No Pools Available` / `Loading available lending pools...`; 165–170 `This Pool Has No Liquidity Yet` / `This lending desk has not been funded yet, so there is nothing to borrow. Pick another desk or check back later.` **or** `This desk only has $${poolLiquidity} USDC available right now. Lower the amount to $${poolLiquidity} or less, or choose another desk.`; 175–178 `Insufficient Collateral` / `You need ${…} ${collateralType}, but your connected Seeker wallet holds ${…} ${collateralType}.`; 196 `Transaction Notice` / `e?.message || 'Failed to submit borrow transaction'`.

### 3.8 P2P Desks tab — `MerchantDesksView.tsx`

**Top bar:** 174 `Lending Desks ({pools.length})` · 193 `P2P Pawns ({offers.length})` · 206 `+ Create Desk` · 214 `📡 NFC (Soon)` · 223 `+ New Pawn`

**Desk empty state:** 234 `🏦` · 235 `No Lending Desks Found` · 236–238 `Be the first to create an on-chain lending desk with your own terms and liquidity!` · 245 `+ Create Lending Desk`

**Desk card:** 263 `⭕`/`🏛️` · 269 `VERIFIED` · 274 `👑 YOUR DESK` · 292 `{pool.poolType.toUpperCase()}` → `INDIVIDUAL`/`CIRCLE`/`INSTITUTIONAL` · 301 `🌌 Open in TARDIS ↗` · 306 `{authority.slice(0,4)}...{authority.slice(-4)} • {min}-{max}d term` · 313 `{(interestRateBps/100).toFixed(1)}%` · 315 `Fixed APR` · 321 `Available` · 323 `${totalLiquidity.toLocaleString()}` · 327 `Max LTV` · 329 `{(maxLtvBps/100).toFixed(0)}%` · 333 `Repayment Rate` · 334 `—` or `${successRate}%` · 343 `Borrow from this Desk →` · 349 `DEPOSIT USDC` · 355 placeholder `500` · 369 `Fund Desk`

**Pawn filters (line 390–393):** `All (${offers.length})` · `My Pawns (${myPawnsCount})` · `Funded (${fundedByMeCount})` · `Completed (${completedCount})`

**Pawn empty states:** 420 `🃏` + title/subtitle by filter — `No Pawns Created Yet` / `You have not listed any pawns yet. Tap "+ New Pawn" to escrow an asset and borrow directly from peers.` (MY_PAWNS, + 445 `+ List First Pawn`); `No Funded Pawns Yet` / `You have not funded any peer pawns. Browse open pawns to fund and earn high APY yield.` (FUNDED); `No Completed Pawns Yet` / `Completed and repaid pawn loans will appear in this history.` (COMPLETED); `No P2P Pawns Listed Yet` / `Be the first to list a digital asset or NFT for peer funding!` (ALL)

**Pawn card:** 468 `{collateralName}` · 471 `YOUR PAWN` · 476 `FUNDED BY YOU` · 481 `Creator: {isCreator ? 'You' : '{slice}...{slice}'}` · 508 `COMPLETED` or `{status.toUpperCase()}` → `OPEN`/`FUNDED`/`INGRACEPERIOD`/`DEFAULTED` · 515 `Ask Principal` · 516 `${requestedAmount} USDC` · 519 `Lender Yield` · 520 `+${interestOffered}` · 523 `Duration` · 524 `{durationDays}d` · 531 `Escrow:` · 533 `{escrowAddress.slice(0,6)}...{slice(-6)}` · 542 `Solscan ↗` · 555 `⏳ Awaiting Peer Funder` · 564 `Cancel & Withdraw` · 573 `🌌 Share to TARDIS Feed (Blink)` · 584 `⚡ Fund & Earn +${interestOffered} USDC` · 592 `🌌 Blink` · 601 `🚨 Funded! Repay ${totalDue} USDC to unlock your {collateralName} from escrow.` · 611 `⚡ Repay ${totalDue} USDC & Unlock Collateral` · 619 `💼 Funded by You — Awaiting borrower repayment (+${interestOffered} USDC yield).` · 624 `🔒 Funded & In Escrow` · 630 `✅ Completed — Collateral Unlocked & Returned`

**Create Desk modal:** 647 `🏛️` · 648 `Create Lending Desk` · 649–651 `Deploy an on-chain lending pool with your own custom interest rate, LTV, and liquidity terms.` · 655 `DESK TYPE` · 674 `Individual Desk` / 676 `Direct 1-on-1 lending` · 696 `Circle Pool` / 698 `Trusted peer circle` · 705 `DESK NAME` · 710 placeholder `e.g. Solana Chad Vault` · 714 presets `Alpha Vault` `Chad Lending` `Seeker Genesis` `DeFi Circle` · 741 `FIXED APR (%)` · 766 `5.0%` `8.0%` `12.0%` · 774 `MAX LTV (%)` · 799 `50%` `60%` `70%` · 810 `MIN TERM (DAYS)` · 819 `MAX TERM (DAYS)` · 831 `INITIAL LIQUIDITY (USDC)` · 856 `$100` `$250` `$500` `$1000` · 866 `⚡ Initializing this desk creates an on-chain Pool PDA and Vault PDA via ClockLend Program (HAjGx...jsH3). Other users will see your desk immediately.` · 876 `🚀 Deploy Desk on Solana` · 881 `Cancel`

**NFC modal:** 892 `📡` · 894 `HARDWARE NFC • COMING SOON` · 896 `Seeker Phone Bump (NFC)` · 897–899 `Hold your Seeker smartphone back-to-back with a trusted peer to instantly establish an authenticated lending circle via hardware NFC chips.` · 902–904 `🔒 Requires physical Seeker Secure Element NFC driver integration. This feature will be enabled in an upcoming Solana Mobile firmware release.` · 913 `⏳ Hardware NFC — Coming Soon` (disabled) · 918 `Close`

**Create Pawn modal:** 928 `List Asset for Peer Pawn` · 929–931 `Escrow your digital asset into an on-chain smart contract lock and borrow directly from peers.` · 934 `COLLATERAL ASSET` · 939 placeholder `e.g. 1,000 SKR or 0.5 SOL` · 943 presets `1,000 SKR` `2,500 SKR` `500 SKR` `0.5 SOL` · 984 `BORROW (USDC)` · 993 `YIELD ($)` · 1004 `DURATION` · 1023 `7 Days` `14 Days` `30 Days` · 1031 `Lock Collateral & List on Solana` · 1035 `Cancel`

**Visible default input values:** `500` (fundAmount), `Solana Chad Vault`, `8.0`, `70`, `7`, `30`, `500`, `1,000 SKR`, `20`, `2`, `7`

**Alerts:** 76 `Missing Name` / `Please enter a name for your lending desk.` · 80 `Invalid APR` / `Please enter a valid fixed APR between 1% and 100%.` · 86 `Invalid LTV` / `Max LTV must be between 10% and 70% (program cap).` · 90 `Invalid Duration` / `Max duration must be greater than or equal to min duration.` · 94 `Invalid Liquidity` / `Please enter a valid initial liquidity amount.` · 137 `🤝 Circle Synced!` / `Connected via Seeker NFC. Desk data refreshed.` **(unreachable — see §8)** · 146 `Invalid Input` / `Please enter a valid asset name, amount, and duration.`

### 3.9 Active Loans tab — `ActiveOrdersView.tsx`

| Line | Exact string | Purpose |
|---|---|---|
| 61–64 | `⏳` · `No Active On-Chain Loans` · `You currently have no active loan orders. Draw instant liquidity from a verified lending desk.` | Empty state |
| 71 | `⚡ Go to Borrow Desk` | Empty-state CTA |
| 90, 91 | `{poolName}` · `Order #{id}` | Card header |
| 108 | `⚠️ Social Grace Active` / `🟢 Active in Escrow` | Status badge |
| 122–124 | `Last known state — not confirmed on-chain. The network could not be reached; these figures come from this device's cache.` | Stale-cache warning |
| 135–136 | `Due date unknown — the loan account does not carry a due_time yet. Refresh once the network is reachable.` | `dueTime === 0` |
| 163 | `Borrowed vs Collateralized` | Ratio panel title |
| 167 | `—` / `${ratio}%` | Ratio figure |
| 176–177 | `${collateralName} locked (USD value unavailable)` / `${collateralName} ≈ $${collVal.toFixed(2)}` | Collateral footer |
| 180 | `Debt ${debt.toFixed(2)}` | Debt footer |
| 184–186 | `Liquidation is time-triggered, not price-based: the loan can be claimed by the desk only after the due date plus a 24h social grace period. Collateral value is informational.` | Footnote |
| 190–191 | `No verified on-chain price right now — USD figures are hidden rather than estimated.` | Untrusted-price note |
| 201, 206, 211, 216 | `Borrowed Principal` · `Locked Collateral` · `Interest Accrued` · `Total to Repay` | Detail labels |
| 202, 207, 212, 217 | `${principalAmount} USDC` · `{collateralName}` · `+${interestDue} USDC` · `${totalDue} USDC` | Detail values |
| 226 | `ON-CHAIN VERIFICATION` | Evidence box |
| 229 | `Solana Mainnet` | Network badge (hard-coded) |
| 235, 256 | `Tx Signature` | Evidence label |
| 238 | `{sig.slice(0,8)}...{sig.slice(-8)}` | Truncated hash |
| 250 | `Solscan ↗` | Solscan chip |
| 263 | `View Wallet on Solscan ↗` | No-signature variant |
| 270 | `Escrow PDA` | Evidence label |
| 280 | `{escrow.slice(0,8)}...{escrow.slice(-8)} ↗` | Escrow hash |
| 298 | `Repay ${totalDue} USDC` | Primary action |
| 311 | `24h Grace` | Secondary (not in grace) |
| 322 | `🚨 TARDIS Rescue` | Secondary (in grace) |

Alerts: 245 `Solscan Transaction` / full signature · 275 `Escrow Account` / full address (both are `Linking.openURL` failure fallbacks).

### 3.10 Account tab — `CreditProfileView.tsx`

**Restructured (2026-09-30).** This screen was reorganised from an undifferentiated
stack of similar-sized cards into seven labelled sections. Line numbers are deliberately
omitted below: they drifted the moment the file was restructured, and a stale table is
worse than none. Verify against source.

Order, top to bottom:

| # | Section | Contents |
|---|---|---|
| 1 | *(unboxed header)* | Avatar, `{skrHandle}`, `SEED VAULT`, `{shorten(pubkey)} • Solana Mainnet`; then `On-Chain Reputation` and the score at 32px/900. Unboxed and largest by type scale so it reads as a screen title, not another panel. |
| 2 | `CREDIT` | Tier pill (`Tier 2 · 50% APR discount` / `Tier 1 · 25% APR discount` / `No SKR bond · 0% APR discount`) in the section header; `SKR Bond Tier Progression` + bar + `Next: Tier …` perk caption; `{n} loans completed on time • {m} defaults`. |
| 3 | `STAKING & EARNINGS` | `$10,000 SKR Track` pill; the tier description; staked figure (26px/800); presets `+500 / +1000 / +2500 / +5000 SKR`; `↩ Unstake {n} SKR`; then a sub-label `SKR PROTOCOL YIELD` with the accrued/claim row. |
| 4 | `WALLET` | `Wallet Holdings (Solana Mainnet)`, `${total}`, then `SOL Balance` / `USDC` / `SKR Tokens` as three ruled rows (was a boxed 3-up grid), then `View & Manage Wallet Assets` with a chevron. |
| 5 | `SECURITY` | Methods badge (`PIN + Biometrics (2/2 Active)` / `PIN Only (1/2 Active)` / `Protection Disabled`); `Require PIN on App Launch` toggle; `Fingerprint / Face ID` toggle; `Change PIN` / `Set Custom PIN`; `Lock Now`. Below a rule: `Seed Vault Enclave` and `Audited Protocol Logic`. |
| 6 | `ABOUT` | `Judge Briefing — how this works`, `View Global Seeker Hall of Fame`, `View Protocol on Solana Explorer ↗`. |
| 7 | *(logout)* | Hairline then a borderless, centred danger-text button. De-emphasised, clearly separated. |

Notes:
- **Every card container was removed** (passport card, six section cards, and the inner
  tier-progress, staked-hero and assets-grid boxes). Structure now comes from a hairline
  rule plus 28pt section spacing and from type size/weight. Secondary rows share one
  anatomy: fixed 22pt icon column, label, sub, value, chevron.
- Two strings lost a trailing `→` (`View Global Seeker Hall of Fame →`,
  `View & Manage Wallet Assets →`) because the row now carries a chevron. All other copy
  is unchanged except where structure required it.
- The `SKR Reputation Bond` card title was absorbed into the `STAKING & EARNINGS` header.
- **Claim button is gated**: disabled (and dimmed from the same value) unless
  `accruedRewards > 0`. The on-chain yield vault has never been funded, so the previous
  always-enabled Claim that always paid 0.0000 USDC has been removed as an affordance.
- Unused remnants kept on purpose: `themeSwitchBtn` / `themeSwitchText` styles and the
  `mode` / `toggleTheme` destructure — evidence of a removed theme switcher, retained
  because this tab is a plausible home for one.

### 3.11 Wallet assets modal — `WalletAssetsModal.tsx`

| Line | Exact string | Purpose |
|---|---|---|
| 123, 125 | `Seeker Wallet Assets` · `Hardware Seed Vault • @{skrHandle}` | Header (+ 133 `✕`) |
| 140, 142, 150 | `CONNECTED PUBLIC KEY` · `{base58}` · `Copy` | Address card |
| 159 | `Hide` / `Switch` | Toggle-address button |
| 173 | `Paste Solana address to inspect (watch-only)...` | **placeholder** (three ASCII periods) |
| 185 | `Load` | Confirm button |
| 196 | `SOLANA PORTFOLIO VALUE` | Total label |
| 212 | `SOLANA MAINNET` | Network pill (hard-coded; the `network` prop is never read) |
| 217 | `${totalUsdValue.toFixed(2)}` | Total figure |
| 220–222 | `Live on-chain price feed${priceAge !== null ? ` · ${priceAge}s ago` : ''}` / `Price feed unavailable — values are last known, not live` | Price-source caption |
| 226 | `@{skrHandle}` | Identity chip |
| 231 | `ASSETS & HOLDINGS` | Section label |
| 240, 241, 245, 247 | `Solana (SOL)` · `Native Gas & Collateral` · `{solBalance.toFixed(3)} SOL` · `≈ ${solUsd.toFixed(2)}` | SOL row |
| 259, 260, 264, 266 | `USD Coin (USDC)` · `Lending Liquidity` · `{usdcBalance.toFixed(2)} USDC` · `≈ ${usdcBalance.toFixed(2)}` | USDC row |
| 278, 279, 284, 287 | `Seeker Token (SKR)` · `Reputation & Staking` · SKR amount · `≈ ${skrUsd.toFixed(2)}` | SKR row |
| 297, 300, 301, 305, 307 | `🐕` · `Bonk (BONK)` · `Community Token` · BONK amount · `≈ ${(bonkBalance*0.00002).toFixed(2)}` | BONK row (only when balance > 0) |
| 321, 324, 326 | `🪙` · `{token.name}` · `{token.symbol} ` + `• Token-2022` (conditional) | Extra token rows |
| 342, 345, 346, 352 | `📱` · `Seeker Genesis Token` · `Device Hardware Enclave` · `VERIFIED` / `NOT DETECTED` | Genesis NFT row |
| 369, 376 | `🔄 Refresh Balances` · `Logout` | Actions |

Alerts: 101 `Empty Address` / `Please enter a valid Solana public key.` · 112 `Invalid Address` / `The address entered is not a valid Solana public key.` · 147 `Connected Address` / full base58 (the "Copy" button opens an alert rather than touching the clipboard).

### 3.12 Transaction notice modal — `TransactionNoticeModal.tsx`

Own literals: 48 `⚡` (borrow) · 50 `🎉` (repay) · 52 `🛡️` (grace) · 54 `⚠️` (error) · 56 `💧` (info) · 58 `✓` (success/default) · 118 `Repaid Principal & Fee` / `Disbursed USDC` · 126 `Collateral Returned` / `Collateral Locked` · 146 `ON-CHAIN VERIFICATION` · 149 `Solana Mainnet` · 155 `Tx Signature` · 166 `Escrow PDA` · 191 `View on Solscan ↗` (fallback) · 204 `Got It` (fallback) · 219 `Done` (secondary fallback). All titles/subtitles come from the caller (§3.1).

A source comment at 131–136 records that no reputation-delta row exists — quoted in full because it explains the absence:

```
{/* No "Credit Boost +N pts" row: the program applies
    `reputation_score.saturating_add(50).min(10000)`
    (processor.rs:2644, :2656) to a score that STARTS at 10000
    (processor.rs:709), so a blanket "+50 pts" would claim a
    gain the program may never apply. Reputation changes are
    read from the profile PDA and shown there. */}
```

### 3.13 Leaderboard — `LeaderboardModal.tsx`

| Line | Exact string | Purpose |
|---|---|---|
| 105, 107 | `Seeker Hall of Fame` · `On-Chain Credit & Reputation Rankings` | Header |
| 128–129 | `100% On-Chain • Zero Centralized Database` | Banner |
| 132 | `Queried live via getProgramAccounts from Solana Mainnet-beta UserProfile PDAs.` | Banner caption |
| 159 | `All Tiers` · `Tier 2 Tier` · `Tier 1 Tier` · `Standard Tier` | Filter chips — **`Tier 2 Tier` and `Tier 1 Tier` render with the duplicated word verbatim** (`{tier === 'ALL' ? 'All Tiers' : `${tier} Tier`}`) |
| 170 | `Scanning Solana Mainnet User Profiles...` | Loading caption |
| 184–188 | `🏆` · `No On-Chain Profiles Found` · `No registered borrower or staker profiles found on Solana Mainnet for this tier yet. Complete your first loan or stake an SKR reputation bond to rank on the Hall of Fame!` | Empty state |
| 214, 218 | `YOU` · `{entry.tier}` | Row badges |
| 224 | `{pubkey.slice(0,4)}...{pubkey.slice(-4)} • {totalLoansCompleted} loans • {stakedSkr.toLocaleString()} SKR` | Row meta |
| 231, 233 | `{(reputationScore/100).toFixed(1)}%` · `Score` | Score column |
| 240–242 | `Reputation is computed autonomously by the ClockLend program based on timely loan repayments and locked SKR bonds.` | Footer note |
| 88–91 | `🥇` `🥈` `🥉` `#{rank}` | Rank badges |

### 3.14 Shared string helpers — `src/solana/onChainService.ts`

`tierDiscountLabel` (199–203): `Tier 2 · 50% APR discount` / `Tier 1 · 25% APR discount` / `No SKR bond · 0% APR discount`.

`describeTransactionError` (1966–1991) — the subtitle for every generic borrow failure:
- `Transaction was cancelled in your wallet.`
- `This desk ran out of liquidity for that amount (InsufficientLiquidity). Try a smaller borrow or another desk.`
- `The desk’s price feed is stale right now, so the program refused the borrow. Try again once the keeper refreshes the feed.`
- `This desk requires its own price feed, which the client could not attach. Nothing was charged — please report this desk.`
- `The escrowed collateral is below what the program requires for this borrow.`
- `Your wallet does not have enough SOL to pay the network fee and rent.`
- fallback: the raw error string, else `Could not complete the transaction.`

`formatUsdcMicro` (264–272) renders micro-units with trailing zeros stripped (e.g. `0.125`, `49.875`, `50`).

### 3.15 TARDIS integration — `src/services/tardisIntegration.ts`

- Share text (25): `🤝 [ClockLend Pawn #${offer.id}] Need $${offer.requestedAmount} USDC against ${offer.collateralName} (${offer.durationDays}d). Earn +$${offer.interestOffered} USDC yield!\n\n${blinkUrl}`; sheet title `ClockLend Pawn #${offer.id}`
- Rescue text (60): `🚨 [ClockLend Peer Rescue] My loan #${order.id} in ${order.poolName} entered its 24h grace window! Circle peers have priority buyout rights to claim ${order.collateralName} collateral:\n\n${rescueBlinkUrl}`; sheet title `🚨 Emergency ClockLend Peer Rescue (#${order.id})`
- 104–107 `Alert.alert('TARDIS Messenger', 'Counterparty handle: @${clean}\n\nOpen the TARDIS app to send an end-to-end encrypted hardware message.')`
- 128–131 `Alert.alert('TARDIS Circle', 'Community Circle: ${clean}\n\nJoin this group inside TARDIS to unlock community member rates.')`

### 3.16 Connect wallet — `ConnectWalletView.tsx`

Header: `ClockLend` (plus an unlabelled green 6 px "mainnet" dot) and the theme toggle pill.

The four slides deliberately use **four different compositions** — no badge/title/paragraph/chip skeleton, no emoji, left-aligned body copy. Each slide opens with a 10 px uppercase kicker; the shared type roles are kicker 10 / display 28 / body 14 / caption 11–12, and on slide 4 the answer (34 px) is larger than anything else on screen.

**Slide 1** (`variant: 'terms'`, kicker `THE LOAN`): title `USDC against your SOL or SKR`; body `Post collateral to a program-owned escrow and receive USDC. Repay principal plus interest by the due date to get it back.`; then a three-row ledger of `label` · `value` / `detail` separated by hairline rules:

- `LTV cap` · `7000 bps (70%)` / `Fixed per pool at creation; new pools cannot exceed it.`
- `Origination fee` · `0.25% SOL / 0.50% SKR` / `Withheld up front, not added to your repayment.`
- `Interest` · `Simple, over a 365-day year` / `The program accepts no partial repayment.`

**Slide 2** (`variant: 'timeline'`, kicker `IF YOU RUN LATE`): title `The 24-hour grace window`; then three dot-and-rail timeline steps (`label` / `detail`):

- `Due date` / `Repayment is due in full.`
- `Window opened` / `You or the desk submit the on-chain instruction that starts a 24-hour window. It is not automatic.`
- `Claim possible` / `Only once the window has expired can the escrowed collateral be claimed.`

note `While the window is open, the program rejects any claim against your escrow.`

**Slide 3** (`variant: 'statement'`, kicker `BEFORE YOU CONNECT`): statement `Your key stays in the Seeker Seed Vault.` (set against a primary-coloured left rule); body `Signing happens on the device. This app holds no key material and cannot move your funds on its own.`; then caveat title `WHAT THIS DOES NOT CLAIM` with three plain-text rows:

- `Staking SKR discounts the interest rate only — 25% off at 100 SKR, 50% at 1,000 SKR. It never raises your LTV.`
- `No insurance, no principal protection, no guaranteed return.`
- `The program is upgradeable by its authority key; prices are admin-fed and rejected past 600 seconds.`

**Slide 4** (`variant: 'calculator'`, kicker `NO WALLET NEEDED`): title `What would you repay?`; then the pre-auth calculator.

Calculator: `BORROW AMOUNT` · `$10` `$25` `$50` `$100` · `LOAN TERM` · `7d` `14d` `30d` · `REPAYMENT · {(liveRateBps/100).toFixed(2)}% APR, LIVE POOL RATE` · `$${calcRepayUsd.toFixed(2)}` · `in {calcDays} days · interest $${calcInterestUsd.toFixed(2)}` · `Estimate only. Collateral price movement and the origination fee withheld at disbursement are not included.` · `Fetching the live mainnet pool rate…` · `Live rate unavailable — connect to see your own terms.`

Pagination: dots (left-aligned with the slide copy) plus a `Next` control, shown on slides 1–3 only.

Bottom: `Connect Seeker Wallet` · `Signed in the Seeker Seed Vault`

Alert (136–139): title `Seeker Hardware Wallet`, body `err?.message || 'Could not connect to Seeker Seed Vault. Please ensure your device is unlocked and authorized to proceed.'`

### 3.17 Countdown timer — `CountdownTimer.tsx`

55 `⚠️ REPAYMENT DUE SOON` (urgent) / `SETTLEMENT COUNTDOWN`; unit suffixes `d` `h` `m` `s`; separator `:` (×3); digits zero-padded via `pad()`. Urgent = `diff < 86400 && diff > 0`.

### 3.18 CircleDeck (dead) — `CircleDeckView.tsx`

Recorded for completeness only — **no call sites**. `Circle Pawn Deck` · `1-on-1 social micro-credit against SOL & SKR tokens` · `+ New Pawn` · `🖼️ NFT`/`🪙 Token` · `🔒 Locked in ClockLend Escrow PDA` · `Borrow Request` · `Funder Profit` · `Status` · `✅ FUNDED`/`🟢 OPEN` · `🤝 FUND LOAN & EARN +${interestOffered}` · `Loan is Active • Due in {durationDays} days` · `🃏 List Pawn Card` · inputs `COLLATERAL ASSET`/`BORROW (USDC)`/`OFFER PROFIT ($)`/`DURATION (DAYS)` with placeholders `e.g. 500 SKR or 1.5 SOL`, `200`, `12`, `14` · `🔒 Lock Collateral & List Card` · `Cancel` · alerts `Invalid Fields`/`Please enter valid loan terms.` and `🃏 Pawn Card Listed!`/`Listed "${collateralName}" requesting ${numReq} USDC on Circle Deck.`

---

## 4. Every interactive control

### 4.1 Text inputs (12 total)

| File:line | Placeholder | keyboardType | Validation | Error shown | Notes |
|---|---|---|---|---|---|
| P2PExpressView:220 | `0` | `numeric` | **none** | none | `parseFloat(x) \|\| 0` — bad input silently becomes `$0` and disables the CTA |
| MerchantDesksView:350 | `500` | `decimal-pad` | `!isNaN(amt) && amt > 0` | **none — silent no-op** | The only submit path in the app with no failure feedback |
| MerchantDesksView:706 | `e.g. Solana Chad Vault` | default | `!deskName.trim()` | `Missing Name` alert | |
| MerchantDesksView:742 | — | `numeric` | `isNaN \|\| <= 0 \|\| > 100` | `Invalid APR` alert (copy says "between 1% and 100%", code accepts 0.5) | |
| MerchantDesksView:775 | — | `numeric` | `isNaN \|\| <= 10 \|\| > 70` | `Invalid LTV` alert (copy says "between 10% and 70%", code rejects exactly 10) | |
| MerchantDesksView:811 / 820 | — | `numeric` | `minD < 1 \|\| maxD < minD` | `Invalid Duration` alert | No upper bound |
| MerchantDesksView:832 | — | `numeric` | `isNaN \|\| <= 0` | `Invalid Liquidity` alert | |
| MerchantDesksView:935 | `e.g. 1,000 SKR or 0.5 SOL` | default | `!assetName \|\| isNaN(amt) \|\| isNaN(prof) \|\| isNaN(d) \|\| amt <= 0` | `Invalid Input` alert | |
| MerchantDesksView:985 / 994 | — | `numeric` | shared with above | `Invalid Input` alert | |
| WalletAssetsModal:168 | `Paste Solana address to inspect (watch-only)...` | **not set** | `!trimmed` → Empty; `new PublicKey()` throw → Invalid | `Empty Address` / `Invalid Address` alerts | No inline validation |
| CircleDeckView (dead) ×4 | `e.g. 500 SKR or 1.5 SOL`, `200`, `12`, `14` | default, `numeric`×3 | NaN checks only for profit/duration | `Invalid Fields` alert | Unreachable |

### 4.2 Buttons — by screen

**Borrow (`P2PExpressView`):** amount presets `$25/$50/$100/$250` (Light haptic, `setAmountStr`); `BORROW MAX` (only when balance > 0; sets 90 % of balance × price × LTV, min `10`); collateral chips `SKR`/`SOL`; `Use SOL Instead` (only when insufficient + not SOL); duration chips `3 Days`/`7 Days`/`14 Days`/`30 Days`; `⚡ Instant Borrow …` CTA.

**Desk tab (`MerchantDesksView`):** sub-tab switcher; `+ Create Desk`; `📡 NFC (Soon)`; `+ New Pawn`; `+ Create Lending Desk` (empty state); `🌌 Open in TARDIS ↗` (Circle only); `Borrow from this Desk →`; `Fund Desk`; 4 pawn filter chips; `+ List First Pawn`; `Solscan ↗`; `Cancel & Withdraw`; `🌌 Share to TARDIS Feed (Blink)`; `⚡ Fund & Earn +$N USDC`; `🌌 Blink`; `⚡ Repay $N USDC & Unlock Collateral`; modal chips (desk type, name presets, APR/LTV/liquidity presets); `🚀 Deploy Desk on Solana`; `Cancel`; asset presets (which also overwrite BORROW and YIELD — `1,000 SKR`→`20`/`2`, `2,500 SKR`→`50`/`5`, `500 SKR`→`10`/`1`, `0.5 SOL`→`50`/`5`); duration chips; `Lock Collateral & List on Solana`; `⏳ Hardware NFC — Coming Soon` (**`disabled={true}`, no `onPress`**); `Close`.

**Loans (`ActiveOrdersView`):** `⚡ Go to Borrow Desk`; `Solscan ↗`; `View Wallet on Solscan ↗`; escrow-hash text (touchable); `Repay N USDC` (Medium haptic); `24h Grace` (Light haptic); `🚨 TARDIS Rescue` (Heavy haptic → `requestTardisGraceRescue`).

**Account (`CreditProfileView`):** `View Global Seeker Hall of Fame →`; stake presets `+500/+1000/+2500/+5000 SKR`; `↩ Unstake N SKR` (`disabled` at 0 available, opacity 0.45); master lock `Switch`; biometric `Switch` (`disabled={!lockEnabled}`); `Change PIN`/`Set Custom PIN`; `Lock Now`; `Claim`; `View Protocol on Solana Explorer ↗`; `Logout`.

**Header:** avatar+handle → Account tab; sparkles chip → Judge Briefing; trophy chip → Leaderboard; theme toggle; wallet chip → Assets modal (`onPressBalance` wins over `onDisconnectWallet`, so **disconnect is unreachable from the header**).

**Modal buttons:** WalletAssets `✕`, `Copy`, `Switch`/`Hide`, `Load`, `🔄 Refresh Balances`, `Logout`; Leaderboard `✕` + 4 filter chips + pull-to-refresh; JudgeBriefing `✕`, `View Verified Program on Solscan ↗`, `Back to Live App`; TransactionNotice primary (variant-dependent), secondary `Done`.

### 4.3 Gestures

| Gesture | Where | Effect |
|---|---|---|
| Horizontal swipe | ConnectWalletView carousel (FlatList `pagingEnabled`) | Pages slides 1–4; updates `activeSlide` |
| Vertical scroll | every view's ScrollView | — |
| Horizontal scroll | MerchantDesks pawn filter bar | — |
| **Pull-to-refresh** | **LeaderboardModal only** (`RefreshControl`) | `handleRefresh` re-fetches entries |
| Long-press | **nowhere** | — |
| Swipe-to-dismiss | **nowhere** — no `PanResponder`, no gesture handler on any modal | — |
| Backdrop tap to dismiss | **nowhere** — every modal overlay is a plain `View` | — |
| NFC bump | **not implemented** — `triggerNfcBump` has no caller and is unreachable | — |
| Haptics | Light on nearly every tap; Medium on borrow/unstake/claim/repay; Heavy on TARDIS rescue; `NotificationFeedbackType.Success`/`Error` on lock screen | — |

---

## 5. States and transitions

### 5.1 Global / cross-screen state

| State | Source | Effect |
|---|---|---|
| `session` | `ConnectWalletView.onConnected` | Gates gate 3 vs the main shell; nulling it (logout) resets orders, offers, profile, balances, toasts `Logged out of @handle` |
| `activeTab` | tabs / deep links / flows | Which of the four views renders |
| `showSplash` / `isLocked` / `lockScreenMode` | launch, AppState resume, Account-tab actions | Which gate renders |
| `integrity` | `checkDeviceIntegrity()` on launch + every foreground | Lockdown screen if `!isSecure` |
| `orders` + `isStale` | SecureStore cache first, then chain | Cached rows render with the "Last known state — not confirmed on-chain" card until a chain read replaces them |
| `pools` / `offers` / `userProfile` / `skrYieldVault` / `userYieldPosition` | `loadProtocolData` via `Promise.allSettled` | Each independently updates only if fulfilled; a rejected fetch leaves that slice unchanged |
| `walletAssets` | `fetchLiveWalletAssets` | Balances; `hasSeekerGenesisToken` starts `false` and is only set from the chain |
| `transactionNotice` | 30+ call sites | Opens `TransactionNoticeModal`; `null` closes it |
| `toastMessage` | `showToast(msg)` | Renders for 2800 ms |
| `borrowPreset` | QuickStartBar presets | Remounts `P2PExpressView` via `key`, prefilling the amount |
| `priceTrusted` | `isLivePriceUsable()`, resynced every 15 s | Gates every USD figure in Loans / Assets |

### 5.2 Per-screen states

> **STALE (2026-09-30).** The two claims below that "Desk tab: no loading state at all" and
> "Loans: no error surface in-view and no retry control" were accurate when written and are
> **no longer true** — `ActiveOrdersView`, `MerchantDesksView` and `LeaderboardModal` now
> implement distinct loading, error, retry and empty states, with error never rendering as
> empty. The per-screen string tables in §3.8, §3.9 and §3.13 do not yet carry the new state
> copy. Re-read those components before relying on this section.


**Borrow:** loading (`Discovering Pools...`; CTA spinner while submitting); empty (two variants, §3.7); error (five alert paths); success → hands off to `App.handleBorrow` which switches to LOANS. **The CTA starts disabled until a trusted price arrives for the selected asset** (`usableAssets` initial `{sol:false, skr:false}`).

**Desk tab:** **no loading state at all** (no `ActivityIndicator`, no skeleton); empty states per sub-tab and per filter; errors only via validation alerts; success is silent (modal closes, parent fires).

**Loans:** no loading state; empty state; stale-cache warning; due-date-unknown card; untrusted-price variant; in-grace vs active styling. **No error surface in-view** and **no retry control** — the only refresh hint is copy inside the due-date card.

**Account:** no loading UI — security prefs load asynchronously, so before they resolve the badge briefly reads `Protection Disabled`, the biometric row is hidden and the PIN button reads `Set Custom PIN`. No error state; yield-card empty state; unstake-button empty states.

**Leaderboard:** loading (`Scanning Solana Mainnet User Profiles...`); empty (used for both "no results" and "fetch failed" — errors are `console.warn` only); success list.

**Connect carousel:** rate `loading`/`live`/`unavailable`; connecting spinner; connect error alert; connect success hands off silently.

### 5.3 Key gating expressions

- `P2PExpressView` CTA `disabled`: `isSubmitting || numAmount <= 0 || isInsufficientCollateral || hasNoLiquidity || exceedsLiquidity || !priceAvailable`. Dimming (`opacity: 0.6`) applies to only three of those — `!priceAvailable`, `isSubmitting` and `numAmount <= 0` disable **without** dimming.
- `P2PExpressView` CTA label priority: `hasNoLiquidity` → `exceedsLiquidity` → `isInsufficientCollateral` → `!priceAvailable` → default.
- `MerchantDesksView`: `isMyDesk = userPubkey && pool.authority.toLowerCase() === userPubkey.toLowerCase()`; the deposit row instead uses case-sensitive `pool.authority === userPubkey` (App-side inconsistency). `myPawnsCount`/`fundedByMeCount` also use raw `===`.
- `MerchantDesksView` action section: `Open` → creator sees `Awaiting Peer Funder` + Cancel + Share, non-creator sees Fund + Blink; `Funded` → creator sees repay, funder sees the "Funded by You" note, others see `🔒 Funded & In Escrow`; **everything else** (including `InGracePeriod` and `Defaulted`) renders `✅ Completed — Collateral Unlocked & Returned`.
- `CreditProfileView`: biometric switch `disabled={!lockEnabled}`; turning the master lock on with no custom PIN routes to `onSetupPin` instead of persisting; `Lock Now` needs `onLockApp && lockEnabled`.
- `WalletAssetsModal`: BONK row only when balance > 0; `Switch`/`Hide` only when `onSwitchAddress` is passed; refresh button `disabled={isRefreshing}`.
- Modals: `JudgeBriefing` and `Leaderboard` are **tap-only** — `showJudgeBriefing` / `showLeaderboard` start `false` and are set only from `Header`; neither auto-opens and neither has a persisted "seen" flag. Only `QuickStartBar` persists (`clocklend_quickstart_dismissed_v1`).

---

## 6. Design system

### 6.1 Colour tokens — `src/theme/ThemeContext.tsx`

| Token | Dark (`darkColors`) | Light (`lightColors`) |
|---|---|---|
| `isDark` | `true` | `false` |
| `background` | `#171E2B` | `#F8FAFC` |
| `card` | `#202838` | `#FFFFFF` |
| `cardAlt` | `#242E42` | `#F1F5F9` |
| `cardBorder` | `rgba(255, 255, 255, 0.08)` | `#E2E8F0` |
| `primary` | `#6366F1` | `#572DFD` |
| `primaryText` | `#FFFFFF` | `#FFFFFF` |
| `text` | `#DEE4EE` | `#0F172A` |
| `textSecondary` | `#B6C1D2` | `#475569` |
| `textMuted` | `#95A3B8` | `#94A3B8` |
| `accent` | `#38BDF8` | `#0284C7` |
| `accentLight` | `#7DD3FC` | `#38BDF8` |
| `danger` | `#F87171` | `#DC2626` |
| `warning` | `#F59E0B` | `#D97706` |
| `badgeBg` | `rgba(99, 102, 241, 0.14)` | `rgba(87, 45, 253, 0.08)` |
| `badgeBorder` | `rgba(99, 102, 241, 0.28)` | `rgba(87, 45, 253, 0.20)` |
| `inputBg` | `#1B2230` | `#FFFFFF` |
| `inputBorder` | `rgba(255, 255, 255, 0.09)` | `#CBD5E1` |
| `divider` | `rgba(255, 255, 255, 0.07)` | `#E2E8F0` |

**Dark palette, 2026-09 rebalance.** The original dark mode was a near-black void with near-white text — 18.6:1, 2.5x past WCAG AAA, which is what read as harsh on an OLED phone at night. Measured WCAG 2.1 ratios now:

| | old dark | new dark |
|---|---|---|
| background relative luminance | 0.0040 | **0.0129** |
| `text` on `background` | 18.57:1 | **13.08:1** |
| `text` on `card` / `cardAlt` | 17.25 / 15.88 | **11.56 / 10.64** |
| `textSecondary` on `background` / `card` / `cardAlt` | 7.58 / 7.04 / 6.48 | **9.19 / 8.12 / 7.48** |
| `textMuted` on `background` / `card` / `cardAlt` | 4.08 / 3.79 / 3.49 | **6.53 / 5.77 / 5.32** |
| `danger` on `background` / `card` / `cardAlt` | 5.16 / 4.80 / 4.41 | **6.04 / 5.34 / 4.92** |
| `warning` on `background` / `card` | 9.05 / 8.40 | 7.78 / 6.88 |
| `accent` on `background` / `card` | 9.07 / 8.42 | 7.80 / 6.89 |
| `accentLight` on `background` / `card` | 11.66 / 10.82 | 10.02 / 8.86 |
| background → `card` surface step | 1.08:1 | **1.13:1** |
| `card` → `cardAlt` surface step | 1.09:1 | 1.09:1 |
| `primaryText` on a `primary` fill | 4.47:1 | 4.47:1 |

Every remaining dark token is >= 4.5:1 (AA) on `background`/`card`/`cardAlt`, and every one the app sets body copy in (`text`, `textSecondary`) is >= 7:1 (AAA). The three alpha surfaces (`cardBorder`, `inputBorder`, `divider`) were raised by ~0.02–0.03 alpha to hold the same edge contrast against the lighter base.

Two known gaps, both pre-existing and both structural rather than palette bugs:
- **`primary` as a text colour is 3.74:1 on the new dark `background`** (4.35:1 before). `#6366F1` is already at the ceiling for a fill that carries white label text (4.47:1 — lightening it further drops `primaryText` on every CTA below AA), so the same token cannot serve both roles. Fixing this needs the token split into a fill (`primary`) and an on-surface text variant, which means touching ~79 `color: colors.primary` call sites.
- **White text on a solid `danger` fill** (`ActiveOrdersView` rescue button, `SecurityLockdownView` exit button): 2.77:1 against `#F87171`. Those two buttons take a documented local `#DC2626` fill instead (4.83:1), because they are the only places `danger` is a fill rather than text.

**Theme behaviour:** `ThemeProvider` initialises `useState<ThemeMode>('light')` — despite `app.json` declaring `"userInterfaceStyle": "dark"` — and the choice is **not persisted** across launches. Toggle: `toggleTheme()` (Header chip, ConnectWalletView pill) flips dark↔light.

**Hard-coded colours outside the theme** (do not respond to the toggle). **Now themed:** `SecurityLockdownView` (was an entirely hard-coded dark palette — `#08090C`, `#12151C`, `#1C1517`, `#FF3B30`, `#FF453A`, `#30D158`, `#8E8E93` — and rendered as a black slab on the light theme; it now reads every surface, text and status colour from the theme, including the `StatusBar` bar style); `SplashScreenView` background (was `#0A0D14`, now `colors.background`); `Header` leaderboard gold `#eab308` → `colors.warning`; `MerchantDesksView` `#f59e0b` → `colors.warning`, `#ef4444` → `colors.danger`, desk-crown gold → `colors.warning`; `LeaderboardModal` `#38bdf8` → `colors.accent`, `#f59e0b` → `colors.warning`, `#94a3b8` → `colors.textSecondary`, gold → `colors.warning`; `ActiveOrdersView` `#ef4444` → `colors.danger` (fill and shadow); `ConnectWalletView` CTA gradient first stop `[colors.primary, '#4F46E5']`.

**Still hard-coded, deliberately:**
- `CircleDeckView` — all-dark. Dead code, no call sites; left alone on purpose.
- Colours with **no matching token** in `ThemeColors`: success greens (`QuickStartBar` `#10B981`, `MerchantDesksView` `#22c55e`, `JudgeBriefingModal` `#22c55e`, `ConnectWalletView` 6 px mainnet dot `#10B981`, `SecurityLockdownView` PASS pill `#4ADE80`/`#15803D`), pool-type violets/blues (`#c084fc`, `#60a5fa`), the "FUNDED" info blue `#3b82f6`, TARDIS teal `#32D4DE`, bronze `#b45309`, and the CTA gradient's second stop `#4F46E5`. Several of these are unreadable on the light theme (e.g. `#22c55e` is 2.28:1 on white); adding `success`/`info` tokens is the follow-up.
- Solid `danger` fills take a documented local `#DC2626` (white on it is 4.83:1) rather than `colors.danger`, which is tuned for danger *text* on each theme's surfaces — see the note under §6.1.
- `#FFFFFF` labels/shadows in static `StyleSheet`s (e.g. `ActiveOrdersView` rescue-button text) are left as-is: `primaryText` is `#FFFFFF` in both themes, so they are already correct.
- Not in this pass's scope: `JudgeBriefingModal` `#c084fc`/`#22c55e`, `CreditProfileView` `#eab308`/`#ff6b6b`/`#FFFFFF`, `SecurityLockScreen` `shadowColor '#6366F1'`, `WalletAssetsModal` `#6366F1`.

### 6.2 Typography

No type-scale constants exist — sizes are inline per style. Observed distribution (occurrences): `11` (51), `12` (46), `10` (37), `13` (32), `14` (22), `16` (11), `18` (10), `15` (10), `9` (8), `20` (8), `28` (4), `22` (4), `24` (3), `44` (2), `40` (2), plus single uses of `52`, `48`, `32`, `26`, `21`, `19`, `17`.

Weights: `'800'` (108), `'700'` (64), `'600'` (27), `'900'` (20), `'500'` (3).

Conventional roles: screen/modal titles 18–19 px at 900; card titles 14–15 px at 800; body 12–13 px; labels/captions 10–11 px at 700–800; uppercase section labels 10 px at 800 with `letterSpacing` 0.5–1; hero numerals 28–52 px at 900; monospace (`fontFamily: 'monospace'` or `fontVariant: ['tabular-nums']`) for addresses, hashes and the countdown.

### 6.3 Spacing

No spacing scale; values are inline. Recurring patterns: screen padding `paddingHorizontal: 16–20`; card padding `14–16`; section gaps `12–14`; `contentContainerStyle` `paddingBottom: 24–40`; Header `paddingTop: 52`, `paddingHorizontal: 20`, `paddingBottom: 16`; tab bar `paddingVertical: 12`, `paddingBottom: 22`, `paddingHorizontal: 8`; lock screen `paddingTop: 54`, `paddingBottom: 44`, `paddingHorizontal: 28`.

### 6.4 Border radii

Occurrences: `14` (31), `12` (28), `8` (18), `20` (17), `16` (14), `6` (11), `10` (9), `3` (8), `18` (8), `4` (6), `24` (6), then one-offs `9`, `17`, `11`, `50`, `43`, `32`, `2`, `19`, `13`.

Conventional roles: cards `14–16`; chips/badges `8–12`; inputs `12–14`; modal sheets `28` top corners only (`borderBottomWidth: 0`); modal dialog cards `24`; primary CTAs `16–18` at height 52–56; pills/circles at half their height (`borderRadius: 18` for 36 px, `borderRadius: 24` for the toast).

### 6.5 Shadows

Only four places use shadows — the app is otherwise flat:
- `App.tsx:1596` toast — `shadowColor '#000'`, offset `{0,4}`, opacity 0.25, radius 8, `elevation: 8`
- `SecurityLockScreen.tsx:442` — `shadowColor '#6366F1'`, opacity 0.4, `elevation: 8` (glow)
- `ActiveOrdersView.tsx` rescue button — `shadowColor: colors.danger` (applied at the call site, since the static sheet cannot read the theme), opacity 0.4, `elevation: 4` (danger glow)
- `WalletAssetsModal.tsx:442` — `shadowColor '#000'`, opacity 0.06, `elevation: 1`

### 6.6 Reusable conventions

- **Cards:** `colors.card` + `borderRadius` 14–16 + `borderWidth: 1` + `colors.cardBorder`.
- **Badges/chips:** `colors.badgeBg` + `colors.badgeBorder`, or a coloured `rgba(...,0.12–0.15)` tint with a matching 0.25–0.3 border; 9–11 px at 700–800.
- **Selected/active state:** `borderColor: colors.primary` + `backgroundColor: colors.badgeBg` + label `colors.primary` at `fontWeight: '800'`.
- **Primary CTA:** full-width, height 52–56, `borderRadius` 16–18, gradient `[colors.primary, '#4F46E5']` (ConnectWalletView) or solid `colors.primary`.
- **Destructive:** `colors.danger` as text on a `rgba(239, 68, 68, 0.1)` wash. Solid destructive fills cannot use `colors.danger` (see §6.1).
- **Empty state:** centred large emoji glyph (fontSize 40) + 16 px/800 title + 12 px muted body, optionally a CTA.
- **Modals:** two presentations — bottom sheet (`justifyContent: 'flex-end'`, height 88–90 %, top radius 28) for Judge/Leaderboard/Assets, and centred dialog (maxHeight 85 %, radius 24) for TransactionNotice.
- **Button feedback:** `activeOpacity` 0.7 (secondary), 0.8, 0.85 (primary), 0.88 (Connect CTA).
- **Loading:** `<ActivityIndicator>` swapped in place of the label inside the button, or centred with a caption.
- **Live indicator:** a 6 px coloured dot (`colors.accent`) + uppercase 10 px label with `letterSpacing`.

### 6.7 App icon / splash configuration

`app.json`:
- `name` `ClockLend`, `slug` `clock-lend`, `scheme` `clocklend`, `version` `1.0.0`, `orientation` `portrait`, `userInterfaceStyle` `dark`
- `icon`: `./assets/icon.png`
- `ios.supportsTablet: true`
- `android.package` `com.clocklend.app`; `adaptiveIcon` background `#0C1435`, foreground `android-icon-foreground.png`, background `android-icon-background.png`, monochrome `android-icon-monochrome.png`; `predictiveBackGestureEnabled: false`
- `web.favicon` `./assets/favicon.png`
- `plugins: ["expo-secure-store"]`
- `splash`: `./assets/splash-icon.png`, `resizeMode: contain`, `backgroundColor: #0C1435`

**Two splash paths:** the Expo native splash above (colour `#0C1435`), then the in-app `SplashScreenView` whose background is a *different* hard-coded colour (`#0A0D14`).

Android: `strings.xml` → `app_name` = `ClockLend`; `styles.xml` → `AppTheme` (DayNight.NoActionBar), `Theme.App.SplashScreen` uses `@drawable/splashscreen_logo`; manifest declares `INTERNET`, `VIBRATE`, read/write external storage (maxSdk 32), portrait-locked, `allowBackup="false"`, `usesCleartextTraffic="false"`.

Assets present: `icon.png`, `logo.png` (used by Splash, ConnectWallet, lock screen, Header avatar), `splash-icon.png`, `favicon.png`, `android-icon-{foreground,background,monochrome}.png`, `tokens/{sol,skr,usdc}.png`, `dapp-store/{banner-1200x600,graphics-1200x1200,icon-512x512}.png`. The dapp-store assets are store-submission artwork, not referenced by app code.

### 6.8 Types — `src/types/index.ts`

`PoolType = 'Individual' | 'Circle' | 'Institutional'`; `LoanStatus = 'Active' | 'InGracePeriod' | 'Repaid' | 'Defaulted'`; `OfferStatus = 'Open' | 'Funded' | 'InGracePeriod' | 'Repaid' | 'Defaulted'`; `CreditTier = 'Tier 2' | 'Tier 1' | 'Standard'`; `SolanaNetwork = 'devnet' | 'mainnet-beta'`; `LendingPool`, `LoanOrder` (incl. `isStale`), `P2POffer`, `UserProfile`, `WalletAssets`, `TokenAssetItem`. Devnet exists only as a type — the app is mainnet-only (`App.tsx:91`: `const selectedNetwork: SolanaNetwork = 'mainnet-beta'`, with a comment that the devnet toggle was removed).

`src/solana/program.ts`: `PROGRAM_ID = 4Dp2A6SHQHEpuoMT4GuzZnnpLcDYrJnpELm1UjuNHgv7`, with PDA seeds `pool`, `vault`, `loan`, `escrow`, `p2p_offer`, `profile`, `treasury`, `skr_escrow`, `oracle`, `admin` — no user-visible strings.

---

## 7. Wallet / onboarding flow

### 7.1 Cold start to first signed transaction

```
Launch
 └─ SplashScreenView  (≈2.45 s, auto, no text)          [gate 1]
     └─ SecurityLockScreen                              [gate 2]
         · if no PIN configured: initSecurity() forces mode 'setup'
           → "Create 4-Digit PIN" → enter → "Confirm Your PIN" → match → save
         · else mode 'unlock' → optional biometric prompt (auto-fires 350 ms
           after init when hardware + preference allow) → 4-digit PIN
         └─ ConnectWalletView                           [gate 3]
             · optional: swipe carousel, slide 4 calculator (no wallet needed)
             · Connect Seeker Wallet  → MWA connectSeekerWallet()
             └─ onConnected(session) → MAIN SHELL       [gate 4]
                 · QuickStartBar may appear (BORROW/MARKET tabs, once/device)
                 · loadProtocolData + fetchLiveWalletAssets in parallel
                 · chain read replaces the SecureStore-cached orders
                 └─ first action: e.g. borrow → signAndSendSeekerTransaction
                     → TransactionNoticeModal → auto-switch to LOANS
```

**Requirements at each step:** splash — none; lock — a 4-digit PIN (setup on first run) or biometrics; connect — an MWA-compatible wallet (Seeker Seed Vault) and an unlocked device; first action — a live trusted price feed (`usableAssets` starts `{sol:false, skr:false}`, so the borrow CTA is disabled until a trusted price arrives), positive amount, sufficient collateral, and a funded desk.

**Wallet session shape** — `SeekerSession { publicKey: PublicKey; skrHandle: string; isSeekerGenesisVerified: boolean }`. The handle is derived by `deriveSkrUsername(pubkey)` (`seekerWallet.ts`), used in the Header, Assets modal, Account passport and transaction notices.

**Address switching** — `WalletAssetsModal` → `Switch` → paste a base58 key → `Load` → `onSwitchAddress(pk)` → `handleSwitchAddress` builds a new session, derives a new handle, refetches assets and protocol data. This is the app's watch-only inspect path.

**Logout** — three entry points (Header wallet chip is *not* one of them): Account tab `Logout`, WalletAssetsModal `Logout`. Both call `handleDisconnect`, which closes the assets modal, nulls the session, clears orders/offers/profile/balances, and toasts `Logged out of @handle`. **No confirmation dialog on either path.**

### 7.2 Failure paths the UI handles

| Failure | Where handled | User sees |
|---|---|---|
| Wallet connect throws | `ConnectWalletView` (`handleMwaConnect`) | Alert `Seeker Hardware Wallet` + `err.message` or the Seed Vault fallback text; button re-enables in `finally` (retry = tap again) |
| Wrong PIN | `SecurityLockScreen` 178 | `Incorrect PIN. Please try again.` + shake animation + error haptic; field clears after 450 ms |
| Too many wrong PINs | `SecurityLockScreen` 176 / `securityService.recordFailedAttempt` | `Too many incorrect attempts. Locked for 30s.` at 5 failures; `300s` at 10. Persisted in SecureStore, so it survives a restart. Keypad and biometrics are inert for the duration. |
| Lockout still active at launch | `SecurityLockScreen` 81 | `Device temporarily locked. Retry in Ns.` |
| Biometric auth fails/cancels | `SecurityLockScreen` | **Silent** — no message, stays on PIN entry |
| Setup PIN mismatch | `SecurityLockScreen` 196 | `PINs do not match. Please try again.`, resets to `enter_new` after 500 ms |
| Change-PIN current wrong | `SecurityLockScreen` 212 | `Current PIN incorrect.` — **no lockout counter applies** (unlimited retries) |
| Setup/change mismatch | 196 / 226 | Two different wordings (see §3.3) |
| Emulator / root / hooking / debugger | `SecurityLockdownView` | Full-screen lockdown naming the specific violation; only `Terminate Application` |
| Integrity check throws | `securityService` 338 | Same lockdown, fail-closed |
| Borrow: no liquidity | `P2PExpressView` 165 / `App` 390 | Alert and transaction-notice variant, both titled `This Pool Has No Liquidity Yet` |
| Borrow: exceeds liquidity | `P2PExpressView` 165 | Alert with the numeric limit |
| Borrow: insufficient collateral | `P2PExpressView` 175 | Alert naming required vs held amounts |
| Borrow: no pools yet | `P2PExpressView` 160 | Alert `No Pools Available` / `Loading available lending pools...` |
| Stale/empty price feed | `describeTransactionError` | `The desk's price feed is stale right now…` |
| Wallet rejection | every handler | `X Cancelled` / `Transaction was cancelled in your wallet.` |
| Pool authority unresolvable on repay | `App` 549 | `Pool Authority Not Found` |
| Yield cooldown | `App` 1069 | `The 1-hour stake cooldown is still active. Try again later.` |
| Non-owner funding a desk | `App` 1168 | `…Only the desk owner can fund a desk.` |
| Unstaking loan-locked SKR | `App` 1214 | `…SKR locked by active loans cannot be unstaked.` |
| Leaderboard fetch fails | `LeaderboardModal` 51–53 | **Silent** (`console.warn`) — renders the empty state instead |
| Solscan link fails (tx/escrow) | `ActiveOrdersView` 245/275 | Alert with the full signature/address as copyable text |
| Solscan link fails (wallet) | `ActiveOrdersView` 259 | Silent (`.catch(() => {})`) |
| Fund Desk with bad input | `MerchantDesksView` 362 | **Silent no-op — no message at all** |
| TARDIS not installed | `tardisIntegration` | Falls back to the native share sheet, or an Alert with the handle/community id |

---

## 8. Dead, unreachable or vestigial UI (explicit)

Confirmed by grep across the repo (excluding `node_modules`):

1. **`CircleDeckView.tsx` — entirely unreachable.** The only references to `CircleDeck` anywhere in the repository are its own definition at lines 15 and 21 of that file. Nothing imports it; `App.tsx` never renders it. Every string in it, its create-pawn modal, and its `onFundOffer`/`onCreateOffer` props are dead. Its nested modal also omits `onRequestClose`, so if it were ever mounted Android back would not close it.
2. **MerchantDesksView NFC path — dead.** `triggerNfcBump` (131–139), `isNfcActive` (55) and the `onNfcBumpCircle` prop are never invoked from any `onPress`. The Alert `🤝 Circle Synced!` / `Connected via Seeker NFC. Desk data refreshed.` can never fire, and `App.tsx:1348`'s `onNfcBumpCircle` handler is never called. The user-facing NFC affordance (`📡 NFC (Soon)`, the modal) is live but explicitly advertised as not-yet-available, and its action button is `disabled={true}` with no handler.
3. **P2PExpressView `onRequestAirdrop`** (props 26/37) — destructured, never used, and not passed by `App.tsx`.
4. **Header `onDisconnectWallet`** — passed by `App.tsx`, but `onPress={onPressBalance || onDisconnectWallet}` means the wallet chip always opens the assets modal; disconnect via the header is unreachable.
5. **Header `solBalance`** — required prop, destructured, never rendered (unused styles `avatarText`, `subtext`, `themeIcon`, `walletIcon` remain).
6. **CreditProfileView theme switcher removed** — `mode`/`toggleTheme` destructured but unused; `themeSwitchBtn`/`themeSwitchText` styles defined but unreferenced. (Theme switching *is* live elsewhere: Header chip and ConnectWalletView pill.)
7. **SecurityLockScreen `attempts` state** (53) — never written; `getUserPin` imported but never called.
8. **WalletAssetsModal network selector removed** — unused styles `networkSegment`, `segmentBtn`, `segmentBtnActive`, `segDot`, `segmentText`, `segmentTextBold`, `actionBtn`, `actionBtnText`; the `network` prop is destructured but never read, and the modal hard-codes `SOLANA MAINNET`. `Linking` imported but unused; `solHolding`/`skrHolding` computed but never rendered.
9. **P2PExpressView** — `mode` destructured from `useTheme()` but unused; `solHolding`/`skrHolding` computed but unused.
10. **CountdownTimer has no `onExpire` callback** — expiry is a purely visual transition; the parent is never notified, and once past due the urgent styling switches *off* (the `diff > 0` guard fails), reverting to the neutral look at `00 : 00 : 00`.
11. **`ExpoSecureStore`-persisted flags** — only two exist: `clocklend_quickstart_dismissed_v1`, plus the security-service keys (`clocklend_security_lock_enabled`, `_pin_salt`, `_pin_hash`, `_pin_configured`, `_failed_attempts`, `_lockout_until`, `_biometrics_enabled`). No modal has a "seen" flag.

---

## 9. Summary counts

| Metric | Count |
|---|---|
| Top-level gates (early returns) | 4 + main shell |
| Bottom tabs | 4 |
| Modals | 7 live + 1 dead (CircleDeck) |
| Components inventoried | 16 (15 live, 1 dead) |
| Text inputs | 12 (11 live, 4 of those in the dead view) |
| Live `Alert.alert` call sites | 8 in components + 1 in App + 2 in tardisIntegration |
| `setTransactionNotice` payloads in App.tsx | 30 |
| Deep-link actions handled | 10 spellings across 5 targets (+ silent no-op fallback) |
| Theme colour tokens | 19 per palette, 2 palettes |
| Persisted state keys | 8 (1 quick-start + 7 security) |

**Two things worth flagging to whoever designs the flow doc, stated as facts rather than judgements:** (a) `MerchantDesksView` has no loading state, so desks and pawns render as empty during the initial chain fetch; and (b) `LeaderboardModal` routes fetch failures into the same empty state as "no profiles exist", so a network failure is indistinguishable from an empty leaderboard in the UI.