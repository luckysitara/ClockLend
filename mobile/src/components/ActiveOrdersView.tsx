import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Linking } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { LoanOrder } from '../types';
import { CountdownTimer } from './CountdownTimer';
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
}

export const ActiveOrdersView: React.FC<ActiveOrdersViewProps> = ({
  orders,
  onRepay,
  onTriggerGrace,
  onNavigateBorrow,
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

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {activeOrders.length === 0 ? (
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

          return (
            <View
              key={order.id}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
                inGrace && { borderColor: colors.warning, backgroundColor: 'rgba(245, 158, 11, 0.05)' },
              ]}
            >
              <View style={styles.cardHeader}>
                <View>
                  <Text style={[styles.poolName, { color: colors.text }]}>{order.poolName}</Text>
                  <Text style={[styles.orderId, { color: colors.textMuted }]}>Order #{order.id}</Text>
                </View>

                <View
                  style={[
                    styles.badge,
                    inGrace
                      ? { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.3)' }
                      : { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      inGrace ? { color: colors.warning } : { color: colors.primary },
                    ]}
                  >
                    {inGrace ? '⚠️ Social Grace Active' : '🟢 Active in Escrow'}
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
                <CountdownTimer dueTime={order.dueTime} />
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
                    style={[styles.rescueBtn, { backgroundColor: '#ef4444' }]}
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
    shadowColor: '#ef4444',
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
