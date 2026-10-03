import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
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
  onClaimDefault?: (order: LoanOrder) => void;
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
  onClaimDefault,
  onNavigateBorrow,
  isLoading = false,
  loadFailed = false,
  onRetry,
}) => {
  const { colors } = useTheme();

  const [orderTab, setOrderTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'BORROWS' | 'DESK_LOANS'>('ALL');

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

  const historyOrders = orders.filter((o) => {
    const s = o.status.toUpperCase();
    return s === 'REPAID' || s === 'DEFAULTED';
  });

  const hasLenderOrders = orders.some((o) => o.isLender);

  const displayedOrders = (orderTab === 'ACTIVE' ? activeOrders : historyOrders).filter((o) => {
    if (roleFilter === 'BORROWS') return !o.isLender;
    if (roleFilter === 'DESK_LOANS') return o.isLender;
    return true;
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

  // Exactly one of these four renders for active orders:
  const hasRows = orderTab === 'ACTIVE' ? activeOrders.length > 0 : historyOrders.length > 0;
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
      refreshControl={
        onRetry ? (
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRetry}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
    >
      {/* ── Top Header Row with ClockLend Logo ── */}
      <View style={styles.topHeaderRow}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/logo.png')} style={styles.headerLogo} resizeMode="contain" />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Loans</Text>
        </View>
        {activeOrders.length > 0 && (
          <View style={[styles.activeBadge, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
            <Text style={[styles.activeBadgeText, { color: colors.primaryLabel }]}>
              {activeOrders.length} {activeOrders.length === 1 ? 'ACTIVE' : 'ACTIVE'}
            </Text>
          </View>
        )}
      </View>

      {/* ── Top Segmented Controls: Active vs History ── */}
      <View style={styles.segmentContainer}>
        <View style={[styles.segmentBar, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              orderTab === 'ACTIVE' && { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1 },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setOrderTab('ACTIVE');
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentText,
                { color: colors.textSecondary },
                orderTab === 'ACTIVE' && { color: colors.text, fontWeight: '800' },
              ]}
            >
              Active ({activeOrders.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentBtn,
              orderTab === 'HISTORY' && { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1 },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setOrderTab('HISTORY');
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentText,
                { color: colors.textSecondary },
                orderTab === 'HISTORY' && { color: colors.text, fontWeight: '800' },
              ]}
            >
              History ({historyOrders.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Optional Role Chips if User has Desk Loans */}
        {hasLenderOrders && (
          <View style={styles.filterChipRow}>
            {(['ALL', 'BORROWS', 'DESK_LOANS'] as const).map((rf) => (
              <TouchableOpacity
                key={rf}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: roleFilter === rf ? colors.badgeBg : colors.card,
                    borderColor: roleFilter === rf ? colors.primary : colors.cardBorder,
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setRoleFilter(rf);
                }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: roleFilter === rf ? colors.primaryLabel : colors.textMuted },
                  ]}
                >
                  {rf === 'ALL' ? 'All Roles' : rf === 'BORROWS' ? 'My Borrows' : 'Desk Lending'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Loading state — only when there is nothing to show yet. */}
      {listState === 'loading' && (
        <View style={[styles.stateBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.stateLabel, { color: colors.textMuted }]}>READING ON-CHAIN LOANS</Text>
          <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
            Querying your loan accounts on Solana Mainnet. No rows are shown until the read answers.
          </Text>
        </View>
      )}

      {/* Error state */}
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

      {/* Refresh failure banner */}
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

      {/* ── Tab Content 1: ACTIVE LOANS ── */}
      {orderTab === 'ACTIVE' && (
        displayedOrders.length === 0 && listState === 'empty' ? (
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
          displayedOrders.map((order) => {
            const totalDue = (order.principalAmount + order.interestDue).toFixed(2);
            const inGrace = order.status.toUpperCase().includes('GRACE');
            const urgency = urgencyById[order.id] ?? 'unknown';
            const isOverdue = !inGrace && urgency === 'overdue';
            const nowSec = Math.floor(Date.now() / 1000);
            const isGraceExpired = Boolean(
              (order.gracePeriodExpires > 0 && nowSec >= order.gracePeriodExpires) ||
              (order.dueTime > 0 && inGrace && nowSec >= order.dueTime + 86400)
            );

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
                    <Text style={[styles.orderId, { color: colors.textMuted }]}>
                      Order #{order.id} {order.isLender ? '• Desk Loan' : ''}
                    </Text>
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
                          : { color: colors.primaryLabel },
                      ]}
                    >
                      {inGrace
                        ? isGraceExpired
                          ? '⚠️ Grace Expired'
                          : '⚠️ Social Grace Active'
                        : isOverdue
                        ? '🔴 Past Due · Grace Not Open'
                        : '🟢 Active in Escrow'}
                    </Text>
                  </View>
                </View>

                {/* M-2: unconfirmed rows warning */}
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

                {/* Ticking Countdown Timer */}
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

                {/* Financial Metrics Strip */}
                <View style={[styles.metricsStrip, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder }]}>
                  <View style={styles.metricColumn}>
                    <Text style={[styles.metricKicker, { color: colors.textMuted }]}>Principal</Text>
                    <Text style={[styles.metricVal, { color: colors.text }]}>${order.principalAmount} USDC</Text>
                  </View>
                  <View style={styles.metricColumn}>
                    <Text style={[styles.metricKicker, { color: colors.textMuted }]}>Interest</Text>
                    <Text style={[styles.metricVal, { color: colors.text }]}>+${order.interestDue} USDC</Text>
                  </View>
                  <View style={styles.metricColumn}>
                    <Text style={[styles.metricKicker, { color: colors.textMuted }]}>Collateral</Text>
                    <Text style={[styles.metricVal, { color: colors.primaryLabel }]}>{order.collateralName}</Text>
                  </View>
                </View>

                {/* On-Chain Evidence Row */}
                <View style={styles.evidenceLine}>
                  {order.txSignature && (
                    <TouchableOpacity
                      style={styles.evidenceLink}
                      onPress={() => {
                        const url = order.solscanUrl || `https://solscan.io/tx/${order.txSignature}`;
                        Linking.openURL(url).catch(() => {
                          Alert.alert('Solscan Transaction', order.txSignature!);
                        });
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.evidenceLinkText, { color: colors.textMuted }]}>
                        Solscan Tx ({order.txSignature.slice(0, 4)}...{order.txSignature.slice(-4)}) ↗
                      </Text>
                    </TouchableOpacity>
                  )}
                  {order.escrowAddress && (
                    <TouchableOpacity
                      style={styles.evidenceLink}
                      onPress={() => {
                        const url = `https://solscan.io/account/${order.escrowAddress}`;
                        Linking.openURL(url).catch(() => {
                          Alert.alert('Escrow Account', order.escrowAddress!);
                        });
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.evidenceLinkText, { color: colors.textMuted }]}>
                        Escrow PDA ↗
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Action Buttons */}
                <View style={styles.actions}>
                  {!order.isLender ? (
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
                  ) : (
                    <View style={[styles.lenderBadgeBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
                      <Text style={[styles.lenderBadgeText, { color: colors.primaryLabel }]}>
                        💼 Desk Disbursed • Borrower: {order.borrower.slice(0, 4)}...{order.borrower.slice(-4)}
                      </Text>
                    </View>
                  )}

                  {!order.isLender && (!inGrace ? (
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
                  ))}

                  {/* Claim Default if grace expired and caller is lender */}
                  {inGrace && isGraceExpired && onClaimDefault && (order.isLender || !order.isLender) && (
                    <TouchableOpacity
                      style={[styles.claimDefaultBtn, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: colors.danger }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                        onClaimDefault(order);
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.claimDefaultBtnText, { color: colors.danger }]}>
                        Claim Default & Liquidate
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )
      )}

      {/* ── Tab Content 2: LOAN HISTORY (Settled / Repaid / Defaulted) ── */}
      {orderTab === 'HISTORY' && (
        displayedOrders.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={styles.emptyIcon}>📜</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Closed Loans Yet</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Completed, repaid, and liquidated loans will be permanently recorded here with full on-chain verification.
            </Text>
          </View>
        ) : (
          displayedOrders.map((order) => {
            const isRepaid = order.status.toUpperCase() === 'REPAID';
            return (
              <View
                key={order.id}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={[styles.poolName, { color: colors.text }]}>{order.poolName}</Text>
                    <Text style={[styles.orderId, { color: colors.textMuted }]}>
                      Order #{order.id} {order.isLender ? '• Desk Loan' : ''}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: isRepaid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        borderColor: isRepaid ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: isRepaid ? '#10B981' : colors.danger },
                      ]}
                    >
                      {isRepaid ? '✓ REPAID' : '✕ DEFAULTED'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.metricsStrip, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, marginTop: 12 }]}>
                  <View style={styles.metricColumn}>
                    <Text style={[styles.metricKicker, { color: colors.textMuted }]}>Principal</Text>
                    <Text style={[styles.metricVal, { color: colors.text }]}>${order.principalAmount.toFixed(2)} USDC</Text>
                  </View>
                  <View style={styles.metricColumn}>
                    <Text style={[styles.metricKicker, { color: colors.textMuted }]}>Interest</Text>
                    <Text style={[styles.metricVal, { color: colors.text }]}>+${order.interestDue.toFixed(2)} USDC</Text>
                  </View>
                  <View style={styles.metricColumn}>
                    <Text style={[styles.metricKicker, { color: colors.textMuted }]}>Collateral</Text>
                    <Text style={[styles.metricVal, { color: isRepaid ? '#10B981' : colors.danger }]}>
                      {order.collateralName} ({isRepaid ? 'Returned' : 'Liquidated'})
                    </Text>
                  </View>
                </View>

                {order.solscanUrl && (
                  <View style={[styles.evidenceLine, { marginTop: 10 }]}>
                    <TouchableOpacity
                      style={styles.evidenceLink}
                      onPress={() => Linking.openURL(order.solscanUrl!)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.evidenceLinkText, { color: colors.primaryLabel }]}>
                        View Settlement on Solscan ↗
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )
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
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 8 : 4,
    paddingBottom: 14,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  activeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
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
  metricsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginVertical: 12,
  },
  metricColumn: {
    alignItems: 'center',
    flex: 1,
  },
  metricKicker: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  metricVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  evidenceLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  evidenceLink: {
    paddingVertical: 2,
  },
  evidenceLinkText: {
    fontSize: 11,
    fontWeight: '600',
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
  segmentContainer: {
    marginBottom: 16,
  },
  segmentBar: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  lenderBadgeBox: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lenderBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  claimDefaultBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  claimDefaultBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
