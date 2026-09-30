import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { LendingPool, UserProfile, WalletAssets } from '../types';
import {
  livePrices,
  fetchLivePrices,
  subscribeToPriceUpdates,
  applyAprDiscountBps,
  calculateExactInterestDue,
  calculateOriginationFee,
  formatUsdcMicro,
  isAssetPriceUsable,
} from '../solana/onChainService';

const SOL_LOGO = require('../../assets/tokens/sol.png');
const SKR_LOGO = require('../../assets/tokens/skr.png');

interface P2PExpressViewProps {
  pools: LendingPool[];
  userProfile: UserProfile;
  walletAssets?: WalletAssets;
  onBorrow: (
    borrowAmount: number,
    collateralUnits: number,
    collateralName: string,
    pool: LendingPool,
    durationDays: number
  ) => void;
  onRequestAirdrop?: () => void;
  isLoadingPools?: boolean;
  initialAmount?: string;
}

export const P2PExpressView: React.FC<P2PExpressViewProps> = ({
  pools,
  userProfile,
  walletAssets,
  onBorrow,
  isLoadingPools = false,
  initialAmount,
}) => {
  const { colors, mode } = useTheme();
  const [amountStr, setAmountStr] = useState<string>(initialAmount ?? '50');
  const [collateralType, setCollateralType] = useState<'SKR' | 'SOL'>('SOL');
  const [durationDays, setDurationDays] = useState<number>(7);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [prices, setPrices] = useState(livePrices);
  const [usableAssets, setUsableAssets] = useState<{ sol: boolean; skr: boolean }>({
    sol: false,
    skr: false,
  });

  useEffect(() => {
    const syncPriceTrust = () =>
      setUsableAssets({ sol: isAssetPriceUsable('sol'), skr: isAssetPriceUsable('skr') });

    fetchLivePrices()
      .then((p) => {
        setPrices({ ...p });
        syncPriceTrust();
      })
      .catch(() => setUsableAssets({ sol: false, skr: false }));

    const unsubscribe = subscribeToPriceUpdates((updated) => {
      setPrices({ ...updated });
      syncPriceTrust();
    });
    const freshnessTimer = setInterval(syncPriceTrust, 15_000);
    return () => {
      unsubscribe();
      clearInterval(freshnessTimer);
    };
  }, []);

  const numAmount = parseFloat(amountStr) || 0;

  const fundedPools = pools.filter((p) => p.totalLiquidity > 0);
  const affordablePools = pools.filter((p) => p.totalLiquidity >= numAmount);
  const lowestApr = (list: typeof pools) =>
    list.length > 0
      ? list.reduce((min, p) => (p.interestRateBps < min.interestRateBps ? p : min), list[0])
      : null;
  const routeCandidates =
    affordablePools.length > 0 ? affordablePools : fundedPools.length > 0 ? fundedPools : pools;
  const bestPool = lowestApr(routeCandidates);

  const solBalance = walletAssets?.solBalance || 0;
  const skrBalance = walletAssets?.skrBalance || 0;

  const solPrice = prices.sol;
  const skrPrice = prices.skr;

  const collateralPrice = collateralType === 'SOL' ? solPrice : skrPrice;
  const priceAvailable = collateralType === 'SOL' ? usableAssets.sol : usableAssets.skr;
  const userBalance = collateralType === 'SOL' ? solBalance : skrBalance;

  const ltv = (bestPool ? bestPool.maxLtvBps : 7000) / 10000;
  const rawCollateral = numAmount > 0 && collateralPrice > 0 ? numAmount / ltv / collateralPrice : 0;
  const isDecimal = collateralType === 'SOL';
  const requiredCollateralUnits = isDecimal ? rawCollateral : Math.ceil(rawCollateral);

  const isInsufficientCollateral = requiredCollateralUnits > userBalance;
  const poolLiquidity = bestPool ? bestPool.totalLiquidity : 0;
  const hasNoLiquidity = fundedPools.length === 0;
  const exceedsLiquidity = !!bestPool && numAmount > poolLiquidity;

  const baseRateBps = bestPool ? bestPool.interestRateBps : 800;
  const effectiveRateBps = applyAprDiscountBps(baseRateBps, userProfile.aprDiscount);
  const effectiveApr = effectiveRateBps / 100;

  const estInterestMicro = calculateExactInterestDue(
    BigInt(Math.round(numAmount * 1_000_000)),
    baseRateBps,
    durationDays * 86400,
    userProfile.aprDiscount
  );
  const estInterest = Number(estInterestMicro) / 1_000_000;

  const origination = calculateOriginationFee(
    BigInt(Math.round(numAmount * 1_000_000)),
    collateralType === 'SOL'
  );

  const handleOpenConfirm = () => {
    if (numAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid loan amount.');
      return;
    }
    if (!bestPool) {
      Alert.alert('No Available Desk', 'No matching lending desk was found. Please check back later.');
      return;
    }
    if (hasNoLiquidity || exceedsLiquidity) {
      Alert.alert(
        'Pool Liquidity Exceeded',
        hasNoLiquidity
          ? 'No funded lending desk is currently open. Check back shortly.'
          : `This desk has $${poolLiquidity.toLocaleString()} USDC available right now.`
      );
      return;
    }
    if (isInsufficientCollateral) {
      Alert.alert(
        'Insufficient Collateral',
        `You need ${requiredCollateralUnits.toFixed(isDecimal ? 3 : 0)} ${collateralType}, but your connected wallet holds ${userBalance.toFixed(isDecimal ? 3 : 0)} ${collateralType}.`
      );
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setShowConfirmModal(true);
  };

  const handleExecuteBorrow = async () => {
    setShowConfirmModal(false);
    if (!bestPool) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setIsSubmitting(true);
    try {
      const collUnits = isDecimal
        ? parseFloat(requiredCollateralUnits.toFixed(3))
        : Math.ceil(requiredCollateralUnits);
      await onBorrow(numAmount, collUnits, collateralType, bestPool, durationDays);
    } catch (e: any) {
      Alert.alert('Transaction Notice', e?.message || 'Failed to submit borrow transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDisabled =
    isSubmitting ||
    numAmount <= 0 ||
    isInsufficientCollateral ||
    hasNoLiquidity ||
    exceedsLiquidity ||
    !priceAvailable;

  const getCtaLabel = () => {
    if (isSubmitting) return 'Submitting Transaction...';
    if (!bestPool || isLoadingPools) return 'Discovering Desks...';
    if (hasNoLiquidity) return 'No Liquidity Available';
    if (exceedsLiquidity) return `Exceeds Desk Max ($${poolLiquidity.toLocaleString()})`;
    if (isInsufficientCollateral) return `Insufficient ${collateralType} Collateral`;
    if (!priceAvailable) return 'Awaiting Live Price...';
    if (numAmount <= 0) return 'Enter Loan Amount';
    return `Borrow ${numAmount} USDC`;
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Top Header Row ── */}
      <View style={styles.topHeaderRow}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/logo.png')} style={styles.headerLogo} resizeMode="contain" />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Instant Borrow</Text>
        </View>
        {walletAssets && (
          <View style={[styles.balancePill, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.balancePillText, { color: colors.primaryLabel }]}>
              {walletAssets.solBalance.toFixed(3)} SOL
            </Text>
          </View>
        )}
      </View>

      {/* ── Jupiter-Style Main Card ── */}
      <View style={[styles.mainCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {/* Section 1: You Borrow */}
        <View style={[styles.inputBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
          <View style={styles.inputHeaderRow}>
            <Text style={[styles.inputHeaderLabel, { color: colors.textSecondary }]}>YOU BORROW</Text>
            {poolLiquidity > 0 && (
              <Text style={[styles.poolAvailText, { color: colors.textMuted }]}>
                Avail: ${poolLiquidity.toLocaleString()} USDC
              </Text>
            )}
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={[styles.numberInput, { color: colors.text }]}
              value={amountStr}
              onChangeText={setAmountStr}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
            />
            <View style={[styles.tokenTag, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
              <Text style={styles.tokenIconText}>$</Text>
              <Text style={[styles.tokenTagText, { color: colors.primaryLabel }]}>USDC</Text>
            </View>
          </View>
        </View>

        {/* Section 2: Collateral Locked */}
        <View style={[styles.inputBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder, marginTop: 12 }]}>
          <View style={styles.inputHeaderRow}>
            <Text style={[styles.inputHeaderLabel, { color: colors.textSecondary }]}>YOU LOCK IN ESCROW</Text>
            <TouchableOpacity
              onPress={() => {
                if (collateralPrice > 0) {
                  const maxAmt = Math.floor(userBalance * ltv * collateralPrice);
                  setAmountStr(maxAmt > 0 ? String(maxAmt) : '0');
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.balanceText, { color: colors.textMuted }]}>
                Bal: {userBalance.toFixed(isDecimal ? 2 : 0)} {collateralType}{' '}
                <Text style={{ color: colors.primaryLabel, fontWeight: '800' }}>MAX</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputRow}>
            <Text style={[styles.collateralAmountText, { color: colors.text }]}>
              {requiredCollateralUnits > 0
                ? requiredCollateralUnits.toFixed(isDecimal ? 3 : 0)
                : '0.00'}
            </Text>

            {/* Collateral Selector (SOL / SKR) */}
            <View style={styles.tokenSelectorGroup}>
              {(['SOL', 'SKR'] as const).map((t) => {
                const isSelected = collateralType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.tokenSelectBtn,
                      { backgroundColor: colors.card, borderColor: colors.cardBorder },
                      isSelected && { backgroundColor: colors.badgeBg, borderColor: colors.primary },
                    ]}
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      setCollateralType(t);
                    }}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={t === 'SOL' ? SOL_LOGO : SKR_LOGO}
                      style={styles.tokenIcon}
                      resizeMode="contain"
                    />
                    <Text
                      style={[
                        styles.tokenSelectText,
                        { color: colors.text },
                        isSelected && { color: colors.primaryLabel, fontWeight: '800' },
                      ]}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Section 3: Duration Selector */}
        <View style={styles.durationSection}>
          <Text style={[styles.durationLabel, { color: colors.textSecondary }]}>LOAN DURATION</Text>
          <View style={styles.durationPillsRow}>
            {[3, 7, 14, 30].map((days) => {
              const isSelected = durationDays === days;
              return (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.durationPill,
                    { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder },
                    isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => {
                    try { Haptics.selectionAsync(); } catch {}
                    setDurationDays(days);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.durationPillText,
                      { color: colors.textSecondary },
                      isSelected && { color: '#FFFFFF', fontWeight: '800' },
                    ]}
                  >
                    {days}d
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Section 4: Loan Breakdown */}
        <View style={[styles.summaryPanel, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Fixed Rate</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{effectiveApr.toFixed(1)}% APR</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Total Repayment</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              ${(numAmount + estInterest).toFixed(2)} USDC{' '}
              <Text style={{ color: colors.primaryLabel, fontSize: 11 }}>
                (+${estInterest.toFixed(3)} int)
              </Text>
            </Text>
          </View>

          <View style={[styles.summaryRow, { marginBottom: 0 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="shield-checkmark" size={13} color={colors.success} />
              <Text style={[styles.summaryLabel, { color: colors.success }]}>Safety Shield</Text>
            </View>
            <Text style={[styles.summaryValue, { color: colors.success }]}>+24h Social Grace</Text>
          </View>
        </View>

        {/* Primary Action Button */}
        <TouchableOpacity
          style={[styles.borrowBtnContainer, isDisabled && styles.borrowBtnDisabled]}
          onPress={handleOpenConfirm}
          disabled={isDisabled}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={mode === 'dark' ? ['#0284C7', '#38BDF8'] : ['#0284C7', '#0EA5E9', '#38BDF8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.borrowBtnGradient}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="flash" size={18} color="#FFFFFF" />
                <Text style={styles.borrowBtnText}>{getCtaLabel()}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ── Sleek Loan Confirmation Modal / Bottom Sheet ── */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowConfirmModal(false)}
          />
          <View style={[styles.confirmSheet, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Confirm Instant Loan</Text>
              <TouchableOpacity onPress={() => setShowConfirmModal(false)} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Terms Summary */}
            <View style={[styles.confirmCard, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
              <View style={styles.confirmRow}>
                <Text style={[styles.confirmLabel, { color: colors.textMuted }]}>Disbursed to Wallet</Text>
                <Text style={[styles.confirmValueBold, { color: colors.primaryLabel }]}>
                  ${numAmount.toFixed(2)} USDC
                </Text>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.divider }]} />

              <View style={styles.confirmRow}>
                <Text style={[styles.confirmLabel, { color: colors.textMuted }]}>Collateral Escrowed</Text>
                <Text style={[styles.confirmValue, { color: colors.text }]}>
                  {requiredCollateralUnits.toFixed(3)} {collateralType}
                </Text>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.divider }]} />

              <View style={styles.confirmRow}>
                <Text style={[styles.confirmLabel, { color: colors.textMuted }]}>Term & Due Date</Text>
                <Text style={[styles.confirmValue, { color: colors.text }]}>
                  {durationDays} Days (+24h Grace)
                </Text>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.divider }]} />

              <View style={styles.confirmRow}>
                <Text style={[styles.confirmLabel, { color: colors.textMuted }]}>Total to Repay</Text>
                <Text style={[styles.confirmValue, { color: colors.text }]}>
                  ${(numAmount + estInterest).toFixed(2)} USDC
                </Text>
              </View>
            </View>

            {/* Seed Vault Protection Notice */}
            <View style={styles.securityNoticeRow}>
              <Ionicons name="shield-checkmark" size={16} color={colors.success} />
              <Text style={[styles.securityNoticeText, { color: colors.textSecondary }]}>
                Authorized via Solana Mobile Seed Vault hardware key
              </Text>
            </View>

            {/* Execute Button */}
            <TouchableOpacity
              style={styles.confirmActionBtn}
              onPress={handleExecuteBorrow}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={mode === 'dark' ? ['#0284C7', '#38BDF8'] : ['#0284C7', '#0EA5E9', '#38BDF8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.confirmActionGradient}
              >
                <Ionicons name="hardware-chip-outline" size={18} color="#FFFFFF" />
                <Text style={styles.confirmActionText}>Sign & Borrow with Seed Vault</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelActionBtn}
              onPress={() => setShowConfirmModal(false)}
            >
              <Text style={[styles.cancelActionText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogo: {
    width: 28,
    height: 28,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  balancePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  balancePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mainCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#0EA5E9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  inputBox: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  inputHeaderLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  poolAvailText: {
    fontSize: 11,
    fontWeight: '600',
  },
  balanceText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  numberInput: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    paddingVertical: 0,
  },
  collateralAmountText: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
  },
  tokenTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  tokenIconText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0EA5E9',
  },
  tokenTagText: {
    fontSize: 14,
    fontWeight: '800',
  },
  tokenSelectorGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  tokenSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  tokenIcon: {
    width: 18,
    height: 18,
  },
  tokenSelectText: {
    fontSize: 13,
    fontWeight: '700',
  },
  durationSection: {
    marginTop: 18,
  },
  durationLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  durationPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationPillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  summaryPanel: {
    marginTop: 18,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  borrowBtnContainer: {
    marginTop: 20,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#0EA5E9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  borrowBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    gap: 8,
  },
  borrowBtnDisabled: {
    opacity: 0.5,
  },
  borrowBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  confirmSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    padding: 22,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(150, 150, 150, 0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  sheetCloseBtn: {
    padding: 4,
  },
  confirmCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  confirmLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  confirmValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  confirmValueBold: {
    fontSize: 16,
    fontWeight: '900',
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  securityNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  securityNoticeText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  confirmActionBtn: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#0EA5E9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  confirmActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    gap: 8,
  },
  confirmActionText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cancelActionBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  cancelActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
