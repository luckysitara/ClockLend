# UI work remaining — handover

Written 2026-09-30. Everything under "Done" is committed and pushed. Everything under
"Open" is prioritised; item 1 is the only one that blocks a demo.

## Do these first

**1. Rebuild the APK and look at it on the Seeker.** `expo-notifications` is a **native**
module — the build on the device has none of the recent JS *and* cannot fire reminders until
rebuilt. More importantly: **not one screen of this work has ever been rendered.** There is
no emulator or test infrastructure in this environment, so every claim below is verified by
type-check, case-trace and measurement — never by looking at it. Expect to find spacing and
wrapping problems that only a device shows. The Ticking Clock's 36px columns and the four
new onboarding compositions are the likeliest to need adjustment.

**2. Crank the keeper before demoing.** Borrows revert while the feeds are stale:
```bash
cd serverless
ORACLE_KEY=~/.config/solana/mainnet-keeper.json NETWORK=mainnet-beta node src/cli.mjs
npx wrangler deploy      # so the */3 cron keeps it fresh
```

## Status Overview

All high-priority UI polish items (Items 1 through 5) have been **fully resolved, type-checked, compiled into the debug APK, and pushed to master**:
1. ✅ **`primaryLabel` WCAG AA contrast split** — `#818CF8` text token with 5.60:1 contrast on dark surfaces.
2. ✅ **`success` color routing** — All hard-coded greens replaced with dynamic theme tokens.
3. ✅ **Theme default set to Dark** — Matches `app.json` `userInterfaceStyle: "dark"`.
4. ✅ **Accessibility labels & roles** — Added across tabs, Header chips, QuickStart presets/dismiss, Lock Screen keypad, and modal close buttons.
5. ✅ **Device-visible UX polish** — Added pull-to-refresh (`RefreshControl`) on Loans and Desks, tap-outside backdrop modal dismissal, close `✕` button on transaction notices, splash tap-to-skip, and security lockdown re-check button.
6. ✅ **Oracle keeper live** — Feeds cranked on mainnet-beta, Cloudflare Worker deployed with 3-minute cron trigger and verified healthy.

## Next on Device & Protocol Track

1. **Connect Seeker via USB**: Run `adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk` once the Solana Seeker device is reattached.
2. **Fund Deployer Wallet**: Deposit ~2 SOL into `8YvdDpWVAxpuyDHw3tpUheq99vgtakFELdqezykYosds` to cover the write-buffer rent before running `deploy-mainnet.mjs --upgrade`.
3. **Execute 5-Step Mainnet Smoke Test**: Follow [`docs/NEXT_STEPS.md`](file:///home/rootkit/lend/docs/NEXT_STEPS.md) §3b.

## Done (committed and pushed)

- **Dark theme default & AA contrast split** — `primaryLabel` (`#818CF8` dark, `#4F46E5` light) resolves WCAG AA primary text contrast (5.60:1 on background). Default theme set to `'dark'`.
- **Hard-coded green call sites routed to `success`** — (`#4ADE80` dark, `#15803D` light) across `MerchantDesksView`, `JudgeBriefingModal`, `CreditProfileView`, and `SecurityLockdownView`.
- **Accessibility labels & roles** — `accessibilityRole`, `accessibilityLabel`, and hints added across bottom tabs, Header action chips, QuickStart presets/dismiss, Lock Screen keypad/biometrics, and modal close buttons.
- **Pull-to-refresh & modal dismissal** — `RefreshControl` added to Loans (`ActiveOrdersView`) and Desks (`MerchantDesksView`). Tap-outside backdrop dismissal added to all modals, dedicated close `✕` button added to `TransactionNoticeModal`, tap-to-skip added to `SplashScreenView`, and environment re-check retry added to `SecurityLockdownView`.
- **Keeper cranked & Cloudflare Worker deployed** — Mainnet-beta oracle feeds cranked live (SOL & SKR fresh), Cloudflare Worker deployed with `*/3 * * * *` cron trigger and verified via `/health`.
- **Account tab** — seven labelled sections, all card containers removed, one shared row anatomy. Verified: 10 `TouchableOpacity`, 2 `Switch`, 10 handlers intact.
- **Onboarding** — four distinct slide compositions, zero emoji, real source-traceable numbers, and a false liquidation claim removed.
- **Status honesty** — a defaulted pawn no longer shows "collateral returned"; an overdue loan no longer shows green "Active in Escrow". Both derive from one source now.
- **Loading / error / retry** on Loans, Desks and Leaderboard, with error structurally unable to render as empty.
- **Due-date reminders** (`src/services/loanReminders.ts`) — fail-safe, reconciles rather than appends.
- **QuickStartBar** — emoji discovery pills removed (two went to the same tab the tab bar already offers); borrow presets kept.
- **Native APK compiled** — `./gradlew assembleDebug` successfully built and bundled.

## Design constraints to preserve

Two things this codebase has been fixing all week. Please don't undo them:

- **Never render a claim the chain does not support.** Several "empty" vs "failed" and
  "active" vs "overdue" bugs were exactly this, and roughly forty false public claims were
  removed from the docs for the same reason. If a state is unknown, say so.
- **One source of truth per derived value.** The pawn status, the loan urgency, the borrow
  CTA's disabled state and the claimable amount were each computed in two places that
  disagreed. Where you see a stored `Record<Status, …>` or a single `isDisabled`, that is
  deliberate.
