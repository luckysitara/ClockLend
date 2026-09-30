import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { LoanOrder } from '../types';
import { CountdownTimer, CountdownUrgency, getCountdownUrgency } from './CountdownTimer';
import { requestTardisGraceRescue } from '../services/tardisIntegration';
import {
  livePrices,
  fetchLivePrices,
  subscribeToPriceUpdates,
  isLivePriceUsable,
  isNativeSolCollateralName,
} from '../solana/onChainService';

interface ActiveOrdersViewProps {
  orders: LoanOrder[];
  onRepay: (order: LoanOrder) => void;
  onTriggerGrace: (orderId: number) => void;
  onNavigateBorrow: () => void;
  /** A protocol read is in flight right now (all three optional so the view
   *  stays usable from a caller that tracks none of this). */
  isLoading?: boolean;
  /** The last completed read of the loan accounts failed. */
  loadFailed?: boolean;
  /** Re-runs the protocol read. Without it the error state is still shown, just
   *  without a retry control. */
  onRetry?: () => void;
}

/** The four mutually exclusive things this screen can be showing. */
type OrdersListState = 'list' | 'loading' | 'error' | 'empty';

/** due_time -> urgency for every tracked loan; 'unknown' when the account
 *  carries no due_time yet (rendered as the due-date-unknown card). */
const urgencyMapFor = (
  orders: Array<{ id: number; dueTime: number }>,
  nowSec: number
): Record<number, CountdownUrgency | 'unknown'> => {
  const map: Record<number, CountdownUrgency | 'unknown'> = {};
  for (const order of orders) {
    if (order.dueTime > 0) map[order.id] = getCountdownUrgency(order.dueTime, nowSec);
    else map[order.id] = 'unknown';
  }
  return map;
};

export const ActiveOrdersView: React.FC<ActiveOrdersViewProps> = ({
  orders,
  onRepay,
  onTriggerGrace,
  onNavigateBorrow,
  isLoading = false,
  loadFailed = false,
  onRetry,
}) => {
  const { colors } = useTheme();

  // H-2: a collateral valuation is only shown when the price the program
  // itself would accept is available (on-chain / Helius WSS source, inside the
  // 600s window it enforces). Otherwise the USD figure is omitted entirely.
  const [priceTrusted, setPriceTrusted] = useState<boolean>(isLivePriceUsable());

  useEffect(() => {
    fetchLivePrices()
      .then(() => setPriceTrusted(isLivePriceUsable()))
      .catch(() => setPriceTrusted(false));
    const unsubscribe = subscribeToPriceUpdates(() => setPriceTrusted(isLivePriceUsable()));
    const timer = setInterval(() => setPriceTrusted(isLivePriceUsable()), 15_000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  const activeOrders = orders.filter((o) => {
    const s = o.status.toUpperCase();
    return s === 'ACTIVE' || s === 'INGRACEPERIOD' || s === 'GRACE_PERIOD';
  });

  // One shared clock for the whole list, so the status badge, the card border
  // and the countdown can never disagree about the same loan. The on-chain
  // LoanStatus only flips to InGracePeriod when someone executes
  // TriggerGracePeriod, so an overdue loan keeps reporting ACTIVE until that
  // instruction lands — the badge must therefore read due_time too.
  // The updater returns the previous map when nothing changed, so the cards
  // re-render only at a phase boundary, not once per second.
  const [urgencyById, setUrgencyById] = useState<Record<number, CountdownUrgency | 'unknown'>>(
    () => urgencyMapFor(activeOrders, Math.floor(Date.now() / 1000))
  );
  const trackedKey = activeOrders.map((o) => `${o.id}:${o.dueTime}:${o.status}`).join('|');

  useEffect(() => {
    const tracked = activeOrders.map((o) => ({ id: o.id, dueTime: o.dueTime }));

    const tick = () => {
      const next = urgencyMapFor(tracked, Math.floor(Date.now() / 1000));
      setUrgencyById((prev) => {
        const ids = Object.keys(next);
        const unchanged =
          ids.length === Object.keys(prev).length && ids.every((id) => prev[Number(id)] === next[Number(id)]);
        return unchanged ? prev : next;
      });
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedKey]);

  // Exactly one of these four renders, so a failed read can never fall through
  // to the empty copy — "we could not read your loans" and "you have no loans"
  // are different facts and are never interchanged:
  //   'list'    rows are on screen. A failed refresh is reported as a banner
  //             above them; the rows themselves are never hidden behind a
  //             spinner or replaced by an error card.
  //   'error'   the last read failed AND nothing is on screen. Never 'empty'.
  //   'loading' a read is in flight and the slice has never been populated.
  //             Only shown when there is nothing to show yet — never over
  //             cached/stale rows, which stay visible with their own warning.
  //   'empty'   the last read SUCCEEDED and this wallet genuinely has no active
  //             loan orders.
  const hasRows = activeOrders.length > 0;
  const listState: OrdersListState = hasRows
    ? 'list'
    : loadFailed
    ? 'error'
    : isLoading && orders.length === 0
    ? 'loading'
    : 'empty';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Loading — only when there is nothing to show yet. Cached rows (marked
          "not confirmed on-chain") are deliberately left visible underneath
          rather than covered by a spinner. */}
      {listState === 'loading' && (
        <View style={[styles.stateBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.stateLabel, { color: colors.textMuted }]}>READING ON-CHAIN LOANS</Text>
          <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
            Querying your loan accounts on Solana Mainnet. No rows are shown until the read answers.
          </Text>
        </View>
      )}

      {/* Error — the last read genuinely failed and nothing is on screen. This
          is NOT the empty state: an unread wallet is not an empty wallet. */}
      {listState === 'error' && (
        <View style={[styles.stateBox, { backgroundColor: colors.card, borderColor: colors.danger }]}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={[styles.stateLabel, { color: colors.danger }]}>LOANS NOT READ</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Could Not Load Your Loans</Text>
          <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
            Reading your loan accounts from Solana Mainnet failed, so your current loan state is
            unknown — this is not an empty result.
          </Text>
          {onRetry && (
            <TouchableOpacity
              style={[
                styles.retryBtn,
                { backgroundColor: colors.primary },
                isLoading && styles.stateDisabled,
              ]}
              onPress={onRetry}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading && <ActivityIndicator size="small" color={colors.primaryText} />}
              <Text style={[styles.retryBtnText, { color: colors.primaryText }]}>
                {isLoading ? 'Retrying...' : 'Retry'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* A failed refresh while rows are on screen: report it above the rows
          instead of replacing confirmed data with an error state. */}
      {listState === 'list' && loadFailed && (
        <View
          style={[styles.refreshFailedCard, { backgroundColor: colors.cardAlt, borderColor: colors.danger }]}
        >
          <Text style={[styles.stateLabel, { color: colors.danger }]}>REFRESH FAILED</Text>
          <Text style={[styles.warningCardText, { color: colors.textSecondary }]}>
            Could not refresh from Solana just now — these rows are the last state we read, not a
            fresh confirmation.
          </Text>
          {onRetry && (
            <TouchableOpacity
              style={[
                styles.refreshRetryChip,
                { backgroundColor: colors.primary },
                isLoading && styles.stateDisabled,
              ]}
              onPress={onRetry}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading && <ActivityIndicator size="small" color={colors.primaryText} />}
              <Text style={[styles.refreshRetryChipText, { color: colors.primaryText }]}>
                {isLoading ? 'Retrying...' : 'Retry'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Empty — only when the read succeeded ('empty' is unreachable while
          loadFailed is set) and the wallet genuinely has no active loans. The
          map below is empty in the loading/error states, so nothing renders
          there. */}
      {activeOrders.length === 0 && listState === 'empty' ? (
        <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.emptyIcon}>⏳</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Active On-Chain Loans</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            You currently have no active loan orders. Draw instant liquidity from a verified lending desk.
          </Text>
          <TouchableOpacity
            style={[styles.borrowNowBtn, { backgroundColor: colors.primary }]}
            onPress={onNavigateBorrow}
            activeOpacity={0.85}
          >
            <Text style={[styles.borrowNowBtnText, { color: colors.primaryText }]}>⚡ Go to Borrow Desk</Text>
          </TouchableOpacity>
        </View>
      ) : (
        activeOrders.map((order) => {
          const totalDue = (order.principalAmount + order.interestDue).toFixed(2);
          const inGrace = order.status.toUpperCase().includes('GRACE');
          const urgency = urgencyById[order.id] ?? 'unknown';
          // Past due_time while the status is still ACTIVE: the grace window has
          // NOT started (it is only opened by an explicit TriggerGracePeriod
          // instruction, available below as "24h Grace"). Saying "Active in
          // Escrow" here told the borrower everything was fine.
          const isOverdue = !inGrace && urgency === 'overdue';

          return (
            <View
              key={order.id}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
                inGrace && { borderColor: colors.warning, backgroundColor: 'rgba(245, 158, 11, 0.05)' },
                isOverdue && { borderColor: colors.danger, backgroundColor: 'rgba(239, 68, 68, 0.05)' },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={[styles.poolName, { color: colors.text }]}>{order.poolName}</Text>
                  <Text style={[styles.orderId, { color: colors.textMuted }]}>Order #{order.id}</Text>
                </View>

                <View
                  style={[
                    styles.badge,
                    inGrace
                      ? { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.3)' }
                      : isOverdue
                      ? { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' }
                      : { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      inGrace
                        ? { color: colors.warning }
                        : isOverdue
                        ? { color: colors.danger }
                        : { color: colors.primary },
                    ]}
                  >
                    {inGrace
                      ? '⚠️ Social Grace Active'
                      : isOverdue
                      ? '🔴 Past Due · Grace Not Open'
                      : '🟢 Active in Escrow'}
                  </Text>
                </View>
              </View>

              {/* M-2: unconfirmed rows must never read as live on-chain state */}
              {order.isStale && (
                <View
                  style={[
                    styles.warningCard,
                    { backgroundColor: 'rgba(245, 158, 11, 0.10)', borderColor: colors.warning },
                  ]}
                >
                  <Text style={[styles.warningCardText, { color: colors.warning }]}>
                    Last known state — not confirmed on-chain. The network could not be reached; these
                    figures come from this device's cache.
                  </Text>
                </View>
              )}

              {/* Ticking Countdown Timer — M-3: an unset due_time is "unknown",
                  never a fabricated date. */}
              {order.dueTime > 0 ? (
                <CountdownTimer dueTime={order.dueTime} graceOpen={inGrace} />
              ) : (
                <View style={[styles.warningCard, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
                  <Text style={[styles.warningCardText, { color: colors.textSecondary }]}>
                    Due date unknown — the loan account does not carry a due_time yet. Refresh once the
                    network is reachable.
                  </Text>
                </View>
              )}

              {/* H-1: the program has NO LTV liquidation. ClaimDefault is
                  time-triggered only: due_time + 24h social grace
                  (processor.rs:2739-2744). So this is a static
                  borrowed-vs-collateralized ratio, not a health meter — and no
                  price-derived figure is shown unless the feed is one the
                  program would accept (H-2). */}
              {(() => {
                const isSol = isNativeSolCollateralName(order.collateralName);
                const debt = order.principalAmount + order.interestDue;
                const price = isSol ? livePrices.sol : livePrices.skr;
                const priceUsable = priceTrusted && price > 0;
                const collVal = priceUsable ? order.collateralAmount * price : null;
                const ratio =
                  collVal && collVal > 0 ? Math.min(999, Math.round((debt / collVal) * 100)) : null;
                const barPct = ratio === null ? 0 : Math.min(100, ratio);

                return (
                  <View style={[styles.healthCard, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
                    <View style={styles.healthHeader}>
                      <View style={styles.healthLabelRow}>
                        <View style={[styles.healthDot, { backgroundColor: colors.primary }]} />
                        <Text style={[styles.healthTitle, { color: colors.text }]}>
                          Borrowed vs Collateralized
                        </Text>
                      </View>
                      <Text style={[styles.healthLtv, { color: colors.text }]}>
                        {ratio === null ? '—' : `${ratio}%`}
                      </Text>
                    </View>
                    <View style={[styles.healthBarTrack, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                      <View style={[styles.healthBarFill, { width: `${barPct}%`, backgroundColor: colors.primary }]} />
                    </View>
                    <View style={styles.healthFooter}>
                      <Text style={[styles.healthFooterText, { color: colors.textMuted }]}>
                        {collVal === null
                          ? `${order.collateralName} locked (USD value unavailable)`
                          : `${order.collateralName} ≈ $${collVal.toFixed(2)}`}
                      </Text>
                      <Text style={[styles.healthFooterText, { color: colors.textMuted }]}>
                        Debt ${debt.toFixed(2)}
                      </Text>
                    </View>
                    <Text style={[styles.healthFootnote, { color: colors.textMuted }]}>
                      Liquidation is time-triggered, not price-based: the loan can be claimed by the
                      desk only after the due date plus a 24h social grace period. Collateral value is
                      informational.
                    </Text>
                    {!priceTrusted && (
                      <Text style={[styles.healthFootnote, { color: colors.warning }]}>
                        No verified on-chain price right now — USD figures are hidden rather than
                        estimated.
                      </Text>
                    )}
                  </View>
                );
              })()}

              {/* Loan Details */}
              <View style={[styles.detailsBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
                <View style={styles.detailRow}>
                  <Text style={[styles.label, { color: colors.textMuted }]}>Borrowed Principal</Text>
                  <Text style={[styles.value, { color: colors.text }]}>${order.principalAmount} USDC</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.label, { color: colors.textMuted }]}>Locked Collateral</Text>
                  <Text style={[styles.valuePurple, { color: colors.accentLight }]}>{order.collateralName}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.label, { color: colors.textMuted }]}>Interest Accrued</Text>
                  <Text style={[styles.value, { color: colors.text }]}>+${order.interestDue} USDC</Text>
                </View>

                <View style={[styles.detailRow, styles.totalRow, { borderTopColor: colors.cardBorder }]}>
                  <Text style={[styles.totalLabel, { color: colors.text }]}>Total to Repay</Text>
                  <Text style={[styles.totalValue, { color: colors.primary }]}>${totalDue} USDC</Text>
                </View>
              </View>

              {/* On-Chain Evidence Box */}
              <View style={[styles.evidenceBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
                <View style={styles.evidenceHeader}>
                  <View style={styles.evidenceTitleRow}>
                    <View style={[styles.dotLive, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.evidenceTitle, { color: colors.text }]}>ON-CHAIN VERIFICATION</Text>
                  </View>
                  <View style={[styles.networkBadge, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
                    <Text style={[styles.networkBadgeText, { color: colors.primary }]}>Solana Mainnet</Text>
                  </View>
                </View>

                {order.txSignature ? (
                  <View style={styles.evidenceRow}>
                    <Text style={[styles.evidenceLabel, { color: colors.textMuted }]}>Tx Signature</Text>
                    <View style={styles.evidenceValRow}>
                      <Text style={[styles.evidenceHash, { color: colors.accentLight }]} numberOfLines={1}>
                        {order.txSignature.slice(0, 8)}...{order.txSignature.slice(-8)}
                      </Text>
                      <TouchableOpacity
                        style={[styles.solscanChip, { backgroundColor: colors.primary }]}
                        onPress={() => {
                          const url = order.solscanUrl || `https://solscan.io/tx/${order.txSignature}`;
                          Linking.openURL(url).catch(() => {
                            Alert.alert('Solscan Transaction', order.txSignature!);
                          });
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.solscanChipText, { color: colors.primaryText }]}>Solscan ↗</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.evidenceRow}>
                    <Text style={[styles.evidenceLabel, { color: colors.textMuted }]}>Tx Signature</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const url = `https://solscan.io/account/${order.borrower}`;
                        Linking.openURL(url).catch(() => {});
                      }}
                    >
                      <Text style={[styles.evidenceHash, { color: colors.accentLight }]}>View Wallet on Solscan ↗</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {order.escrowAddress && (
                  <View style={styles.evidenceRow}>
                    <Text style={[styles.evidenceLabel, { color: colors.textMuted }]}>Escrow PDA</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const url = `https://solscan.io/account/${order.escrowAddress}`;
                        Linking.openURL(url).catch(() => {
                          Alert.alert('Escrow Account', order.escrowAddress!);
                        });
                      }}
                    >
                      <Text style={[styles.evidenceHash, { color: colors.textSecondary }]} numberOfLines={1}>
                        {order.escrowAddress.slice(0, 8)}...{order.escrowAddress.slice(-8)} ↗
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.repayBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onRepay(order);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.repayBtnText, { color: colors.primaryText }]}>
                    Repay ${totalDue} USDC
                  </Text>
                </TouchableOpacity>

                {!inGrace ? (
                  <TouchableOpacity
                    style={[styles.graceBtn, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onTriggerGrace(order.id);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.graceBtnText, { color: colors.textSecondary }]}>24h Grace</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.rescueBtn, { backgroundColor: colors.danger, shadowColor: colors.danger }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                      requestTardisGraceRescue(order);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.rescueBtnText}>🚨 TARDIS Rescue</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyBox: {
    padding: 36,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 30,
  },
  // Loading / error cards share the empty box's metrics so the three states
  // occupy the same place on screen.
  stateBox: {
    paddingHorizontal: 28,
    paddingVertical: 32,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 30,
    gap: 10,
  },
  stateLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  stateBody: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  // Same dimming discipline as the rest of the app: a disabled control must
  // look disabled.
  stateDisabled: {
    opacity: 0.6,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 4,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  refreshFailedCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 14,
  },
  refreshRetryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    marginTop: 8,
  },
  refreshRetryChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  borrowNowBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  borrowNowBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  poolName: {
    fontSize: 16,
    fontWeight: '800',
  },
  orderId: {
    fontSize: 11,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  detailsBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginVertical: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  label: {
    fontSize: 12,
  },
  value: {
    fontSize: 12,
    fontWeight: '700',
  },
  valuePurple: {
    fontSize: 12,
    fontWeight: '700',
  },
  totalRow: {
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 6,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  repayBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  repayBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  graceBtn: {
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  graceBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rescueBtn: {
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    // shadowColor comes from the theme's danger token at the call site.
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  rescueBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  evidenceBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  evidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  evidenceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dotLive: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  evidenceTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  networkBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  networkBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  evidenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 3,
  },
  evidenceLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  evidenceValRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  evidenceHash: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  solscanChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  solscanChipText: {
    fontSize: 10,
    fontWeight: '800',
  },
  healthCard: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 6,
  },
  healthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  healthLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  healthDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  healthTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  healthLtv: {
    fontSize: 12,
    fontWeight: '900',
  },
  healthBarTrack: {
    height: 6,
    borderRadius: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  healthBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  healthFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  healthFootnote: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 6,
  },
  warningCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginTop: 8,
  },
  warningCardText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  healthFooterText: {
    fontSize: 10,
  },
});
