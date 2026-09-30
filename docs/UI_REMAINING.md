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

## Open items, in priority order

**1. `primary` as a TEXT colour fails WCAG AA — 3.74:1.** This is the one regression the
dark-theme pass introduced, disclosed rather than hidden. It is structural: `#6366F1` is
already at its ceiling as a *fill* carrying white labels (4.47:1), so lightening it enough
for text would break every CTA instead. The fix is to split one token into two:

- keep `primary` (`#6366F1`) for fills
- add a text variant at **`#818CF8`** — measured 5.60:1 on background, 4.95:1 on card

It touches roughly 79 `color: colors.primary` call sites and **needs per-site judgement, not
a find-and-replace**: some are labels on tinted badges, some are text on primary fills that
must stay white, some are icons where 3:1 is the applicable bar. Do it screen by screen.

**2. Finish routing the hard-coded greens through the new `success` token.** A `success`
token now exists (dark `#4ADE80`, light `#15803D`) and `QuickStartBar` uses it. These still
do not: `MerchantDesksView`, `ActiveOrdersView`, `LeaderboardModal`, `JudgeBriefingModal`,
`CreditProfileView`, `SecurityLockdownView` (documented local). Several are unreadable in
light mode — the worst measured was 2.28:1 on white.

The same applies to the pool-type violet/blue (`#c084fc`, `#60a5fa`), the "FUNDED" blue
`#3b82f6`, and TARDIS teal `#32D4DE`. An `info` token would cover those.

**3. Light mode has never been reviewed.** The app declares `userInterfaceStyle: "dark"` in
`app.json` but `ThemeContext.tsx` initialises to `useState<ThemeMode>('light')` — so it
actually **opens in light mode**, and the choice is not persisted. Either default to dark or
fix light mode properly; right now nobody has looked at it. Several hard-coded colours are
unreadable there.

**4. Zero accessibility labels in the entire app.** No `accessibilityLabel`,
`accessibilityHint`, `accessibilityRole` or `testID` anywhere. Every icon-only control is
unlabelled for screen readers — the Header's four chips, both modal close buttons, the lock
screen keypad, the QuickStart dismiss. This is a correctness gap, not a nicety, and it is
cheap to fix incrementally.

**5. Device-visible polish, still open:**
- Modals are **not tap-outside-dismissable** (`WalletAssetsModal`, `TransactionNoticeModal`,
  `LeaderboardModal`, `JudgeBriefingModal`). That is the Android convention and its absence
  reads as unpolished. `TransactionNoticeModal` also has **no close button** —
  dismissal is via its own buttons or the hardware back key.
- The **splash has no tap-to-skip** and runs ~2.45s every launch.
- **No pull-to-refresh** on Loans or Desks; retry is a button. The leaderboard has it.
- `SecurityLockdownView` has no way out except terminating the app — no retry, no dismiss.

**6. Inventory gaps.** `docs/APP_UI_INVENTORY.md` §3.8, §3.9 and §3.13 string tables do not
carry the new loading/error/retry copy added in `0bf5b7d`. §5.2 carries an inline staleness
marker. Regenerating those sections is mechanical but needs care.

## Done (committed and pushed)

- **Dark theme** — base lifted off near-black (18.6:1 → 13.08:1 body contrast), three
  pre-existing AA failures fixed, hard-coded palettes routed through the theme.
- **Account tab** — seven labelled sections, all card containers removed, one shared row
  anatomy. Verified: 10 `TouchableOpacity`, 2 `Switch`, 10 handlers intact.
- **Onboarding** — four distinct slide compositions, zero emoji, real source-traceable
  numbers, and a false liquidation claim removed.
- **Status honesty** — a defaulted pawn no longer shows "collateral returned"; an overdue
  loan no longer shows green "Active in Escrow". Both derive from one source now.
- **Loading / error / retry** on Loans, Desks and Leaderboard, with error structurally
  unable to render as empty.
- **Due-date reminders** (`src/services/loanReminders.ts`) — fail-safe, reconciles rather
  than appends. Needs the APK rebuild to function.
- **QuickStartBar** — emoji discovery pills removed (two went to the same tab the tab bar
  already offers); borrow presets kept.

## Design constraints to preserve

Two things this codebase has been fixing all week. Please don't undo them:

- **Never render a claim the chain does not support.** Several "empty" vs "failed" and
  "active" vs "overdue" bugs were exactly this, and roughly forty false public claims were
  removed from the docs for the same reason. If a state is unknown, say so.
- **One source of truth per derived value.** The pawn status, the loan urgency, the borrow
  CTA's disabled state and the claimable amount were each computed in two places that
  disagreed. Where you see a stored `Record<Status, …>` or a single `isDisabled`, that is
  deliberate.
