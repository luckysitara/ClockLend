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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  const { colors } = useTheme();
  const [amountStr, setAmountStr] = useState<string>(initialAmount ?? '50');
  const [collateralType, setCollateralType] = useState<'SKR' | 'SOL'>('SOL');
  const [durationDays, setDurationDays] = useState<number>(7);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
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

  const handleBorrow = async () => {
    if (numAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid loan amount.');
      return;
    }
    if (!bestPool) {
      Alert.alert('No Pools Available', 'Loading available lending pools...');
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
      {/* Jupiter-Style Main Card */}
      <View style={[styles.mainCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        
        {/* Section 1: You Borrow */}
        <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
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
            <View style={[styles.tokenPill, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
              <View style={[styles.tokenDot, { backgroundColor: '#2775CA' }]} />
              <Text style={[styles.tokenName, { color: colors.text }]}>USDC</Text>
            </View>
          </View>

          {/* Quick Amount Chips */}
          <View style={styles.presetsRow}>
            {['25', '50', '100', '250'].map((val) => (
              <TouchableOpacity
                key={val}
                style={[
                  styles.presetChip,
                  { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder },
                  amountStr === val && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  setAmountStr(val);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Preset $${val} USDC`}
              >
                <Text
                  style={[
                    styles.presetText,
                    { color: colors.textSecondary },
                    amountStr === val && { color: colors.primaryText, fontWeight: '700' },
                  ]}
                >
                  ${val}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Connector Badge */}
        <View style={styles.connectorRow}>
          <View style={[styles.connectorLine, { backgroundColor: colors.cardBorder }]} />
          <View style={[styles.connectorCircle, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Ionicons name="arrow-down" size={16} color={colors.primaryLabel} />
          </View>
          <View style={[styles.connectorLine, { backgroundColor: colors.cardBorder }]} />
        </View>

        {/* Section 2: Collateral Required */}
        <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
          <View style={styles.inputHeaderRow}>
            <Text style={[styles.inputHeaderLabel, { color: colors.textSecondary }]}>COLLATERAL TO LOCK</Text>
            <TouchableOpacity
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                if (userBalance > 0) {
                  const maxUsdc = Math.max(10, Math.floor(userBalance * 0.9 * collateralPrice * ltv));
                  setAmountStr(maxUsdc.toString());
                }
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Borrow max collateral"
            >
              <Text style={[styles.balanceText, { color: colors.textMuted }]}>
                Bal: {userBalance.toFixed(isDecimal ? 2 : 0)} {collateralType}{' '}
                <Text style={{ color: colors.primaryLabel, fontWeight: '700' }}>MAX</Text>
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
                      { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder },
                      isSelected && { backgroundColor: colors.badgeBg, borderColor: colors.primary },
                    ]}
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      setCollateralType(t);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${t} collateral`}
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
                  accessibilityRole="button"
                  accessibilityLabel={`${days} days loan duration`}
                >
                  <Text
                    style={[
                      styles.durationPillText,
                      { color: colors.textSecondary },
                      isSelected && { color: colors.primaryText, fontWeight: '800' },
                    ]}
                  >
                    {days}d
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Section 4: Compact Summary Panel */}
        <View style={[styles.summaryPanel, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder }]}>
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

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Origination Fee</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              ${formatUsdcMicro(origination.netMicro)} net{' '}
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                (-${formatUsdcMicro(origination.feeMicro)})
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
          style={[
            styles.borrowBtn,
            { backgroundColor: colors.primary },
            isDisabled && styles.borrowBtnDisabled,
          ]}
          onPress={handleBorrow}
          disabled={isDisabled}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel={getCtaLabel()}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.primaryText} />
          ) : (
            <Text style={[styles.borrowBtnText, { color: colors.primaryText }]}>
              {getCtaLabel()}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  mainCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
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
    letterSpacing: 0.8,
  },
  poolAvailText: {
    fontSize: 11,
    fontWeight: '500',
  },
  balanceText: {
    fontSize: 11,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  numberInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '800',
    padding: 0,
    marginRight: 12,
  },
  tokenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tokenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tokenName: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  presetChip: {
    flex: 1,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetText: {
    fontSize: 12,
    fontWeight: '600',
  },
  connectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: -8,
    zIndex: 10,
  },
  connectorLine: {
    flex: 1,
    height: 1,
  },
  connectorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 12,
  },
  collateralAmountText: {
    fontSize: 26,
    fontWeight: '800',
  },
  tokenSelectorGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  tokenSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  tokenIcon: {
    width: 16,
    height: 16,
  },
  tokenSelectText: {
    fontSize: 13,
    fontWeight: '700',
  },
  durationSection: {
    marginTop: 16,
    marginBottom: 14,
  },
  durationLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  durationPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationPill: {
    flex: 1,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  summaryPanel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  borrowBtn: {
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  borrowBtnDisabled: {
    opacity: 0.6,
  },
  borrowBtnText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
