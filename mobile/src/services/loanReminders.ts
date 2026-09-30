/**
 * Due-date reminders — the reason a borrower has to come back.
 *
 * A lending app has exactly one event that must pull a user back: the date they
 * owe money. Everything else is optional. This schedules a local reminder at
 * due−24h and at the due time, and cancels them when the loan stops being
 * active, so a repaid loan can never produce a stale "your loan is due" ping.
 *
 * DESIGN CONSTRAINTS — please keep these if you edit this file:
 *
 * 1. FAIL-SAFE, NEVER FATAL. `expo-notifications` is a native module. A top-level
 *    `import` would throw at module load in any build that lacks it (an APK built
 *    before this dependency was added, a dev client without it) and white-screen
 *    the whole app. Every entry point here is wrapped, and every failure resolves
 *    to "reminders unavailable". A reminder must never be able to break a money
 *    flow or the app.
 *
 * 2. RECONCILE, DO NOT APPEND. `syncLoanReminders` cancels the reminders this
 *    module owns before rescheduling. Without that, repaying a loan leaves its
 *    reminders pending and the user gets nagged about a settled debt.
 *
 * 3. ONLY CANCEL WHAT WE OWN. Cancellation is scoped to notifications carrying
 *    our `kind` marker rather than `cancelAllScheduledNotificationsAsync()`, so a
 *    future feature that schedules its own notifications is not silently wiped.
 */
import type { LoanOrder } from '../types';

/** Marks a notification as ours, so we only ever cancel our own. */
const KIND = 'clocklend-loan-due';
/** Set once we know whether the module loaded and permission was granted. */
let supported: boolean | null = null;

/**
 * Lazily and safely obtain the native module.
 * Returns null in any environment where it is unavailable, rather than throwing.
 */
function loadNotifications(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-notifications');
    return mod ?? null;
  } catch {
    return null;
  }
}

/** Configure the foreground handler and the Android channel. Idempotent. */
async function ensureConfigured(N: any): Promise<void> {
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Handler is cosmetic; carry on.
  }
  try {
    const { Platform } = require('react-native');
    if (Platform?.OS === 'android') {
      await N.setNotificationChannelAsync('loan-due', {
        name: 'Loan reminders',
        importance: N.AndroidImportance?.HIGH ?? 4,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
  } catch {
    // A missing channel only downgrades presentation.
  }
}

/**
 * Ask for permission if we have not already.
 * Called only when there is a real loan to remind about, so the prompt arrives
 * with context rather than on cold start.
 */
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

/** True when reminders can work at all in this build. */
export async function remindersSupported(): Promise<boolean> {
  if (supported !== null) return supported;
  const N = loadNotifications();
  supported = !!N;
  return supported;
}

/**
 * Reconcile scheduled reminders against the current set of loans.
 *
 * Safe to call on every refresh — it is a no-op when nothing changed in a way
 * that matters, and it never throws.
 */
export async function syncLoanReminders(orders: LoanOrder[]): Promise<void> {
  try {
    const N = loadNotifications();
    if (!N) {
      supported = false;
      return;
    }
    supported = true;

    // Only loans the user still has to act on.
    const active = (orders ?? []).filter(
      (o) => o && (o.status === 'Active' || o.status === 'InGracePeriod') && Number(o.dueTime) > 0
    );

    // Nothing outstanding: clear ours and stop. Do not request permission to
    // cancel notifications.
    if (active.length === 0) {
      await cancelOurs(N);
      return;
    }

    if (!(await ensurePermission(N))) return;
    await ensureConfigured(N);
    await cancelOurs(N);

    const nowSec = Math.floor(Date.now() / 1000);
    for (const loan of active) {
      const due = Number(loan.dueTime);
      if (!Number.isFinite(due) || due <= nowSec) continue; // already past due; the in-app clock covers it

      const label = loan.collateralName ? ` for ${loan.collateralName}` : '';
      const dueIn24h = due - 24 * 3600;

      if (dueIn24h > nowSec) {
        await schedule(N, dueIn24h, 'Loan due in 24 hours', `Order #${loan.id}${label} is due tomorrow. Repay in the app to unlock your collateral.`, loan.id);
      }
      await schedule(N, due, 'Loan due now', `Order #${loan.id}${label} is due. Repay in the app to unlock your collateral — a 24-hour grace window can be opened on chain after this point.`, loan.id);
    }
  } catch {
    // Reminders are best-effort by design.
  }
}

async function schedule(N: any, whenSec: number, title: string, body: string, loanId: number): Promise<void> {
  try {
    await N.scheduleNotificationAsync({
      content: { title, body, data: { kind: KIND, loanId } },
      trigger: {
        type: N.SchedulableTriggerInputTypes?.DATE ?? 'date',
        date: new Date(whenSec * 1000),
        channelId: 'loan-due',
      },
    });
  } catch {
    // One failed schedule must not abort the others.
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
    // If we cannot enumerate, we simply leave them; better than cancelling blind.
  }
}

/** Clear every reminder we own. Call on logout so the next user starts clean. */
export async function clearLoanReminders(): Promise<void> {
  try {
    const N = loadNotifications();
    if (!N) return;
    await cancelOurs(N);
  } catch {
    // best-effort
  }
}
