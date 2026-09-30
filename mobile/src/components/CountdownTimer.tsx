import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

/**
 * Where a loan sits relative to its on-chain due date. Exported so the loan
 * card derives its badge and border from the exact same source as the clock —
 * a card whose badge says "Active" next to a countdown that says "overdue" is
 * contradicting itself.
 *
 *   'later'   — more than 24h of term left
 *   'dueSoon' — inside the final 24h
 *   'overdue' — due_time has passed
 *
 * 'overdue' is NOT liquidation. The program only lets the desk claim the
 * collateral after a further 24h grace window has been opened on-chain, and
 * the borrower can still repay while that window (or the whole term) runs.
 */
export type CountdownUrgency = 'later' | 'dueSoon' | 'overdue';

export const getCountdownUrgency = (dueTime: number, nowSec: number): CountdownUrgency => {
  if (nowSec >= dueTime) return 'overdue';
  if (dueTime - nowSec < 86400) return 'dueSoon';
  return 'later';
};

interface CountdownTimerProps {
  dueTime: number;
  /**
   * True when this loan's 24h social grace window has already been opened
   * on-chain (status InGracePeriod). The clock then reads as "past due, grace
   * running" in warning rather than danger, so it agrees with the card badge.
   */
  graceOpen?: boolean;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ dueTime, graceOpen = false }) => {
  const { colors } = useTheme();
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const update = () => setNowSec(Math.floor(Date.now() / 1000));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [dueTime]);

  const urgency = getCountdownUrgency(dueTime, nowSec);
  // Past due the clock counts up, so the panel keeps showing how long the loan
  // has been outstanding instead of freezing at 00 : 00 : 00.
  const diff = urgency === 'overdue' ? nowSec - dueTime : Math.max(0, dueTime - nowSec);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const units = [
    { value: Math.floor(diff / 86400), label: 'DAYS' },
    { value: Math.floor((diff % 86400) / 3600), label: 'HRS' },
    { value: Math.floor((diff % 3600) / 60), label: 'MIN' },
    { value: diff % 60, label: 'SEC' },
  ];

  // The program only accepts TriggerGracePeriod once now >= due_time
  // (processor.rs: LoanNotDue), so a grace-open loan is always past due; the
  // extra guard just keeps a stale cached status from switching the copy.
  const inGraceWindow = graceOpen && urgency === 'overdue';

  const accent = inGraceWindow
    ? colors.warning
    : urgency === 'overdue'
    ? colors.danger
    : urgency === 'dueSoon'
    ? colors.warning
    : colors.primary;

  const tint = inGraceWindow
    ? 'rgba(245, 158, 11, 0.10)'
    : urgency === 'overdue'
    ? 'rgba(239, 68, 68, 0.10)'
    : urgency === 'dueSoon'
    ? 'rgba(245, 158, 11, 0.10)'
    : colors.cardAlt;

  const label = inGraceWindow
    ? 'PAST DUE — 24H GRACE WINDOW OPEN'
    : urgency === 'overdue'
    ? 'PAST DUE — REPAY NOW'
    : urgency === 'dueSoon'
    ? 'REPAYMENT DUE IN UNDER 24H'
    : 'REPAYMENT DUE IN';

  const caption = inGraceWindow
    ? 'Past due by the time above. The 24h social grace window is open on-chain — repay or be rescued before it closes; nothing has been seized yet.'
    : urgency === 'overdue'
    ? 'The due date has passed. No grace window has been opened yet, and nothing is liquidated automatically — the desk can only claim the collateral once a 24h grace window is opened on-chain. You can still repay now.'
    : 'Counts down to the on-chain due date. Nothing liquidates at zero — a 24h grace window must be opened on-chain first.';

  return (
    <View style={[styles.container, { backgroundColor: tint, borderColor: accent }]}>
      <View style={styles.labelRow}>
        <View style={[styles.liveDot, { backgroundColor: accent }]} />
        <Text style={[styles.label, { color: accent }]}>{label}</Text>
      </View>

      <View style={styles.clockRow}>
        {units.map((unit) => (
          <View
            key={unit.label}
            style={[styles.unit, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          >
            <Text style={[styles.digits, { color: accent }]} numberOfLines={1}>
              {pad(unit.value)}
            </Text>
            <Text style={[styles.unitLabel, { color: colors.textMuted }]}>{unit.label}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.caption, { color: colors.textSecondary }]}>{caption}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginVertical: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  clockRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 6,
  },
  unit: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  digits: {
    fontSize: 36,
    fontWeight: '900',
    fontFamily: 'monospace',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  unitLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },
  caption: {
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
    marginTop: 10,
  },
});
