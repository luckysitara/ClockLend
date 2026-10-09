/**
 * Collateral health alerts — the warning before the loss.
 *
 * A borrower's collateral is only taken when a loan is *defaulted*, and a
 * default settles at the current oracle price (processor.rs, `ClaimDefault`):
 * the lender is made whole out of the escrow and the remainder goes back to the
 * borrower. That means a falling price never costs the borrower anything —
 * until the escrow is worth less than the debt, at which point a default takes
 * the whole thing and there is no remainder left to return.
 *
 * So the thing worth waking someone up for is not the price. It is the distance
 * between what their escrow is worth and what they owe. This module measures
 * that distance, bands it, and tells them once per band, in time to act.
 *
 * DESIGN CONSTRAINTS — identical to `loanReminders.ts`, and for the same
 * reasons. Please keep them if you edit this file:
 *
 * 1. FAIL-SAFE, NEVER FATAL. `expo-notifications` is a native module and a
 *    top-level import would white-screen any build that lacks it. Every entry
 *    point is wrapped and every failure resolves to "alerts unavailable".
 *
 * 2. PURE MATH IS SEPARATE. `assessLoanHealth` does no I/O and never throws, so
 *    the UI can call it on every render and the bands can be tested directly.
 *
 * 3. NOTIFY ON CROSSING, NOT ON STATE. A band is announced once when it is
 *    entered. Re-announcing a position that is merely still bad is how an alert
 *    becomes noise, and noise is how the one that matters gets ignored.
 *
 * 4. NEVER INVENT A PRICE. If the feed is missing or unusable the position is
 *    reported as unknown and nothing is scheduled. A guessed price would either
 *    panic a healthy borrower or lull a drowning one.
 */
import type { LoanOrder, LendingPool } from '../types';

/** Marks a notification as ours, so we only ever cancel our own. */
const KIND = 'clocklend-collateral-health';
/** Where the last-announced band per loan is kept, so a restart stays quiet. */
const SEEN_KEY = 'clocklend.collateralAlerts.seen.v1';

/**
 * The collateral mints the program accepts. Mirrored rather than imported so
 * this module stays free of the Solana client (see constraint 1).
 */
const MINT_SOL = 'So11111111111111111111111111111111111111112';
const MINT_SKR = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';

/**
 * Where the alerts are drawn, as a fraction the price has fallen from its level
 * at borrow time.
 *
 * The entry point is not a guess: the program refuses a borrow above
 * `pool.max_ltv_bps`, so at origination the escrow is worth exactly
 * `1 / (max_ltv_bps / 10000)` times the debt. Everything below is measured
 * against that.
 */
export const DROP_CAUTION = 0.10;
export const DROP_WARNING = 0.20;
export const DROP_URGENT = 0.30;

/**
 * Bands are compared with a slack, because the thresholds are exactly the
 * values a round price move produces. `drop` is derived as
 * `1 - now/atEntry`, and that subtraction lands a hair under the boundary it
 * should equal — a price down exactly 30% yields 0.29999999999999993, which
 * fails `>= 0.30` and reports one band late. The slack is ~1e-9, far below any
 * difference a feed can actually express, so it only ever absorbs the rounding
 * it exists for.
 */
const BOUNDARY_EPS = 1e-9;

/**
 * Coverage is `escrow value / debt`. At 1.0 a default takes every unit of
 * collateral and returns nothing — the line the borrower must not reach.
 */
export const COVERAGE_LINE = 1.0;

/**
 * Used only when the pool's LTV is unknown, so a healthy-looking ratio cannot
 * be manufactured out of missing data. Deliberately tighter than the drop
 * bands above: without an entry point we alert earlier, not later.
 */
const FALLBACK_CAUTION = 1.30;
const FALLBACK_WARNING = 1.15;
const FALLBACK_URGENT = 1.05;

export type HealthBand = 'ok' | 'caution' | 'warning' | 'urgent';

export interface LoanHealth {
  loanId: number;
  /** Escrow value divided by debt. 1.0 is the line; below it a default takes all. */
  coverage: number;
  /** How far the collateral price has fallen from its level at borrow time, 0..1. */
  drop: number;
  /** Fraction of the escrow a default would return to the borrower, 0..1. */
  surplusShare: number;
  collateralValueUsd: number;
  debtUsd: number;
  band: HealthBand;
}

export interface PriceSet {
  sol: number;
  skr: number;
  usdc: number;
}

/** The price of a collateral mint, or null when we have no usable one. */
function priceFor(mint: string, prices: PriceSet): number | null {
  // USDC collateral is worth a dollar; the program only lends against the two
  // mints below, so anything else is a record we do not understand.
  if (mint === MINT_SOL) return clean(prices?.sol);
  if (mint === MINT_SKR) return clean(prices?.skr);
  return null;
}

function clean(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function bandFor(coverage: number, drop: number, entryKnown: boolean): HealthBand {
  // At or below the line a default returns nothing. This check comes first and
  // is deliberately not scaled by the entry point: the line is the line.
  if (coverage <= COVERAGE_LINE + BOUNDARY_EPS) return 'urgent';
  if (!entryKnown) {
    if (coverage <= FALLBACK_URGENT + BOUNDARY_EPS) return 'urgent';
    if (coverage <= FALLBACK_WARNING + BOUNDARY_EPS) return 'warning';
    if (coverage <= FALLBACK_CAUTION + BOUNDARY_EPS) return 'caution';
    return 'ok';
  }
  if (drop >= DROP_URGENT - BOUNDARY_EPS) return 'urgent';
  if (drop >= DROP_WARNING - BOUNDARY_EPS) return 'warning';
  if (drop >= DROP_CAUTION - BOUNDARY_EPS) return 'caution';
  return 'ok';
}

/**
 * Measure one loan. Returns null when it cannot be measured honestly — no
 * price, no debt, or a loan that is no longer running.
 *
 * Never throws, and performs no I/O, so it is safe to call from render.
 */
export function assessLoanHealth(
  loan: LoanOrder | null | undefined,
  pool: LendingPool | null | undefined,
  prices: PriceSet
): LoanHealth | null {
  try {
    if (!loan) return null;
    if (loan.status !== 'Active' && loan.status !== 'InGracePeriod') return null;

    const debtUsd = Number(loan.principalAmount) + Number(loan.interestDue);
    if (!Number.isFinite(debtUsd) || debtUsd <= 0) return null;

    const price = priceFor(String(loan.collateralMint ?? ''), prices);
    if (price === null) return null;

    const amount = Number(loan.collateralAmount);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const collateralValueUsd = amount * price;
    const coverage = collateralValueUsd / debtUsd;

    const maxLtvBps = Number(pool?.maxLtvBps);
    const entryKnown = Number.isFinite(maxLtvBps) && maxLtvBps > 0 && maxLtvBps <= 10000;
    const entryCoverage = entryKnown ? 10000 / maxLtvBps : null;
    // A price fall is the inverse of a coverage fall against the entry point.
    const drop = entryCoverage ? Math.max(0, 1 - coverage / entryCoverage) : 0;

    return {
      loanId: loan.id,
      coverage,
      drop,
      // What a default would hand back today, as a share of the escrow.
      surplusShare: Math.max(0, 1 - 1 / coverage),
      collateralValueUsd,
      debtUsd,
      band: bandFor(coverage, drop, entryKnown),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Notification plumbing. Same shape as `loanReminders.ts` — lazily loaded,
// never fatal, and scoped to notifications carrying our own marker.
// ---------------------------------------------------------------------------

let supported: boolean | null = null;

function loadNotifications(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-notifications') ?? null;
  } catch {
    return null;
  }
}

/** True when alerts can work at all in this build. */
export async function collateralAlertsSupported(): Promise<boolean> {
  if (supported !== null) return supported;
  supported = !!loadNotifications();
  return supported;
}

/**
 * Remember which band each loan was last announced at.
 *
 * Backed by SecureStore when it is available and by an in-memory map when it is
 * not, so a restart does not re-announce a position the borrower has already
 * been told about. Never throws.
 */
const seenMemory = new Map<number, HealthBand>();
const BAND_ORDER: HealthBand[] = ['ok', 'caution', 'warning', 'urgent'];

async function loadSeen(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const SecureStore = require('expo-secure-store');
    const raw = await SecureStore.getItemAsync(SEEN_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    for (const [id, band] of Object.entries(parsed ?? {})) {
      if (BAND_ORDER.includes(band as HealthBand)) seenMemory.set(Number(id), band as HealthBand);
    }
  } catch {
    // Memory-only is a fine degradation: the worst case is one extra alert.
  }
}

async function saveSeen(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const SecureStore = require('expo-secure-store');
    const obj: Record<string, HealthBand> = {};
    seenMemory.forEach((band, id) => {
      obj[String(id)] = band;
    });
    await SecureStore.setItemAsync(SEEN_KEY, JSON.stringify(obj));
  } catch {
    // best-effort
  }
}

/** Forget a loan's history. Call on logout alongside `clearLoanReminders`. */
export async function clearCollateralAlerts(): Promise<void> {
  seenMemory.clear();
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const SecureStore = require('expo-secure-store');
    await SecureStore.deleteItemAsync(SEEN_KEY);
  } catch {
    // best-effort
  }
  const N = loadNotifications();
  if (N) await cancelOurs(N);
}

async function ensureConfigured(N: any): Promise<void> {
  try {
    const { Platform } = require('react-native');
    if (Platform?.OS === 'android') {
      await N.setNotificationChannelAsync('collateral-health', {
        name: 'Collateral health',
        importance: N.AndroidImportance?.HIGH ?? 4,
        vibrationPattern: [0, 250, 150, 250],
      });
    }
  } catch {
    // A missing channel only downgrades presentation.
  }
}

async function ensurePermission(N: any): Promise<boolean> {
  try {
    const current = await N.getPermissionsAsync();
    if (current?.granted) return true;
    if (current?.canAskAgain === false) return false;
    const asked = await N.requestPermissionsAsync();
    return !!asked?.granted;
  } catch {
    return false;
  }
}

/** Cancel only the notifications this module scheduled. */
async function cancelOurs(N: any): Promise<void> {
  try {
    const all = await N.getAllScheduledNotificationsAsync();
    for (const n of all ?? []) {
      if (n?.content?.data?.kind === KIND && n?.identifier) {
        await N.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch {
    // If we cannot enumerate, we leave them; better than cancelling blind.
  }
}

/** Headline and body for a band. Deliberately plain: this is a money alert. */
function copyFor(health: LoanHealth, label: string, reachingLine: boolean): { title: string; body: string } {
  const pct = Math.round(health.drop * 100);
  const value = Math.round(health.collateralValueUsd);
  const debt = Math.round(health.debtUsd);

  if (reachingLine || health.band === 'urgent') {
    return {
      title: 'Your collateral is at the line',
      body:
        `${label} is worth about $${value} against $${debt} owed. A default now would take all of it, ` +
        `with nothing returned. Repay to release it.`,
    };
  }
  if (health.band === 'warning') {
    return {
      title: `Collateral down ${pct}%`,
      body:
        `${label} is worth about $${value} against $${debt} owed. ` +
        `You keep ${Math.round(health.surplusShare * 100)}% of it if you repay — and less of it the further this goes.`,
    };
  }
  return {
    title: `Collateral down ${pct}%`,
    body:
      `${label} is worth about $${value} against $${debt} owed. ` +
      `Still covered — this is an early warning, not a liquidation.`,
  };
}

/**
 * Reconcile alerts against the current loans, pools and prices.
 *
 * Safe to call on every refresh and on every price tick. Annonces each band
 * once per loan; never throws.
 */
export async function syncCollateralAlerts(
  orders: LoanOrder[],
  pools: LendingPool[],
  prices: PriceSet
): Promise<void> {
  try {
    const active = (orders ?? []).filter(
      (o) => o && (o.status === 'Active' || o.status === 'InGracePeriod')
    );
    if (active.length === 0) return;

    const assessed: LoanHealth[] = [];
    for (const loan of active) {
      const pool = (pools ?? []).find((p) => p?.id === loan.poolId) ?? null;
      const health = assessLoanHealth(loan, pool, prices);
      if (health) assessed.push(health);
    }
    if (assessed.length === 0) return;

    await loadSeen();

    // Anything that needs saying, and has not been said at this level yet.
    const toAnnounce = assessed.filter((h) => {
      const last = seenMemory.get(h.loanId) ?? 'ok';
      return BAND_ORDER.indexOf(h.band) > BAND_ORDER.indexOf(last);
    });
    // Positions that recovered are quietly reset, so a later slide back down
    // is a real event again rather than being swallowed by old history.
    for (const h of assessed) {
      if (h.band === 'ok' && seenMemory.get(h.loanId)) seenMemory.delete(h.loanId);
    }
    if (toAnnounce.length === 0) return;

    const N = loadNotifications();
    if (!N) {
      supported = false;
      return;
    }
    supported = true;
    if (!(await ensurePermission(N))) return;
    await ensureConfigured(N);

    for (const health of toAnnounce) {
      const loan = active.find((l) => l.id === health.loanId);
      const label = loan?.collateralName ? `Your ${loan.collateralName} collateral` : 'Your collateral';
      const { title, body } = copyFor(health, label, health.coverage <= COVERAGE_LINE);
      try {
        await N.scheduleNotificationAsync({
          content: { title, body, data: { kind: KIND, loanId: health.loanId, band: health.band } },
          // Present immediately: this is a state observation, not a time.
          trigger: null,
        });
      } catch {
        // One failed alert must not abort the others.
      }
      seenMemory.set(health.loanId, health.band);
    }
    await saveSeen();
  } catch {
    // Alerts are best-effort by design and must never break a money flow.
  }
}
