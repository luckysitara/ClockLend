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
  Dimensions,
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
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
  onOpenAssetsModal?: () => void;
  isLoadingPools?: boolean;
  initialAmount?: string;
  // Desk explicitly chosen in the Markets screen. When set it is honored over
  // the lowest-APR auto-router; when null the router picks as before.
  preselectedPool?: LendingPool | null;
}

export const P2PExpressView: React.FC<P2PExpressViewProps> = ({
  pools,
  userProfile,
  walletAssets,
  onBorrow,
  onOpenAssetsModal,
  isLoadingPools = false,
  initialAmount,
  preselectedPool = null,
}) => {
  const { colors, mode } = useTheme();
  // Use placeholder instead of hardcoded '50'
  const [amountStr, setAmountStr] = useState<string>(initialAmount ?? '');
  const [collateralType, setCollateralType] = useState<'SKR' | 'SOL'>('SKR');
  const [showCollateralModal, setShowCollateralModal] = useState<boolean>(false);
  const [durationDays, setDurationDays] = useState<number>(7);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
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
    // Self-healing poll: the CTA blocks until each collateral asset has a
    // TRUSTED on-chain price under 600s old, and only the oracle keeper can
    // produce one. The WSS push only fires on account change, so when the
    // keeper lapses past the staleness bound nothing else would recover the
    // screen. fetchLivePrices() is internally throttled to one real attempt
    // per 10s, so this 15s cadence is effectively one RPC read per tick and
    // unblocks the CTA on its own as soon as a fresh feed lands on-chain.
    const freshnessTimer = setInterval(() => {
      fetchLivePrices()
        .then((p) => {
          setPrices({ ...p });
          syncPriceTrust();
        })
        .catch(() => syncPriceTrust());
    }, 15_000);
    return () => {
      unsubscribe();
      clearInterval(freshnessTimer);
    };
  }, []);

  const numAmount = parseFloat(amountStr) || 0;

  const validPools = pools.filter((p) => {
    const n = (p.name || '').toLowerCase();
    return (
      !n.includes('seeker genesis') &&
      !n.includes('chad') &&
      p.id !== 1 &&
      p.id !== 958 &&
      p.poolPubkey !== '4YC4rCNXva8ty6f1pKRC2NX7e5kufqowBYJDCMor12Wu'
    );
  });

  const fundedPools = validPools.filter((p) => p.totalLiquidity > 0);
  const affordablePools = validPools.filter((p) => p.totalLiquidity >= numAmount);
  const lowestApr = (list: typeof validPools) =>
    list.length > 0
      ? list.reduce((min, p) => (p.interestRateBps < min.interestRateBps ? p : min), list[0])
      : null;
  const routeCandidates =
    affordablePools.length > 0 ? affordablePools : fundedPools.length > 0 ? fundedPools : validPools;
  // A desk chosen in the Markets screen wins outright — the router must not
  // silently re-route the user to a different (lower-APR) desk. All terms
  // below (LTV, APR, liquidity, interest) then derive from THIS desk, and
  // amounts beyond its liquidity are blocked in handleOpenConfirm.
  const bestPool = preselectedPool ?? lowestApr(routeCandidates);

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

  const isInsufficientCollateral = numAmount > 0 && requiredCollateralUnits > userBalance;
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

  const isActionDisabled =
    isSubmitting ||
    (numAmount > 0 &&
      (isInsufficientCollateral ||
        hasNoLiquidity ||
        exceedsLiquidity ||
        !priceAvailable ||
        !bestPool));

  const getCtaLabel = () => {
    if (isSubmitting) return 'Submitting Transaction...';
    if (isDiscovering || isLoadingPools) return 'Discovering Desks...';
    if (numAmount <= 0) return 'Discover Desk';
    if (!bestPool) return 'No Desks Available';
    if (hasNoLiquidity) return 'No Liquidity Available';
    if (exceedsLiquidity) return `Exceeds Desk Max ($${poolLiquidity.toLocaleString()})`;
    if (isInsufficientCollateral) return `Insufficient ${collateralType} Collateral`;
    if (!priceAvailable) return 'Awaiting Live Price...';
    return `Borrow ${numAmount} USDC`;
  };

  const handlePrimaryPress = () => {
    if (numAmount <= 0) {
      setIsDiscovering(true);
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      setTimeout(() => {
        setIsDiscovering(false);
        setAmountStr('50');
      }, 1000);
      return;
    }
    handleOpenConfirm();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Top Header Row with Wallet Icon ── */}
      <View style={styles.topHeaderRow}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/logo.png')} style={styles.headerLogo} resizeMode="contain" />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Instant Borrow</Text>
        </View>
        <TouchableOpacity
          style={[styles.walletChip, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            if (onOpenAssetsModal) {
              onOpenAssetsModal();
            } else {
              Alert.alert(
                'Wallet Balances',
                `SOL: ${solBalance.toFixed(3)}\nSKR: ${skrBalance.toLocaleString()}\nUSDC: $${walletAssets?.usdcBalance?.toFixed(2) ?? '0.00'}`
              );
            }
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Open wallet assets"
        >
          <Ionicons name="wallet-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ── Main Card ── */}
      <View style={[styles.mainCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {/* Section 1: Borrow Amount */}
        <View style={[styles.inputBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
          <View style={styles.inputHeaderRow}>
            <Text style={[styles.inputHeaderLabel, { color: colors.textSecondary }]}>BORROW AMOUNT</Text>
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
              onChangeText={(val) => {
                const sanitized = val.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
                setAmountStr(sanitized);
              }}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
            />
            <View style={[styles.tokenTag, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
              <Text style={styles.tokenIconText}>$</Text>
              <Text style={[styles.tokenTagText, { color: colors.primaryLabel }]}>USDC</Text>
            </View>
          </View>
        </View>

        {/* Section 2: Collateral in Escrow */}
        <View style={[styles.inputBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder, marginTop: 20 }]}>
          <View style={styles.inputHeaderRow}>
            <Text style={[styles.inputHeaderLabel, { color: colors.textSecondary }]}>COLLATERAL IN ESCROW</Text>
            <TouchableOpacity
              onPress={() => {
                if (collateralPrice > 0) {
                  const maxAmt = Math.floor(userBalance * ltv * collateralPrice);
                  setAmountStr(maxAmt > 0 ? String(maxAmt) : '');
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
            <Text
              style={[
                styles.collateralAmountText,
                { color: requiredCollateralUnits > 0 ? colors.text : colors.textMuted },
              ]}
            >
              {requiredCollateralUnits > 0
                ? requiredCollateralUnits.toFixed(isDecimal ? 3 : 0)
                : '0.00'}
            </Text>

            {/* Dropdown Trigger for Collateral Currency */}
            <TouchableOpacity
              style={[styles.dropdownTrigger, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setShowCollateralModal(true);
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Select collateral: currently ${collateralType}`}
            >
              <Image
                source={collateralType === 'SOL' ? SOL_LOGO : SKR_LOGO}
                style={styles.dropdownIcon}
                resizeMode="contain"
              />
              <Text style={[styles.dropdownText, { color: colors.text }]}>{collateralType}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 3: Duration Selector with Smaller Pills */}
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
          {bestPool && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
                {preselectedPool ? 'Selected Desk' : 'Desk'}
              </Text>
              <Text
                style={[
                  styles.summaryValue,
                  { color: preselectedPool ? colors.primaryLabel : colors.text, flex: 1, textAlign: 'right', marginLeft: 12 },
                ]}
                numberOfLines={1}
              >
                {bestPool.name} • {(bestPool.interestRateBps / 100).toFixed(1)}% / 30d
              </Text>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Interest Fee</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {numAmount > 0 ? ((estInterest / numAmount) * 100).toFixed(2) : '0.00'}% flat (${estInterest.toFixed(2)})
              <Text style={{ color: colors.primaryLabel, fontSize: 11, fontWeight: '700' }}>
                {' '}• {effectiveApr.toFixed(1)}% per 30d
              </Text>
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Total Repayment</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              ${(numAmount + estInterest).toFixed(2)} USDC{' '}
              <Text style={{ color: colors.primaryLabel, fontSize: 11 }}>
                (+${estInterest.toFixed(2)} fee)
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

        {/* Primary Action Button: No icon/emoji, solid background when active/discovering */}
        <TouchableOpacity
          style={[
            styles.borrowBtn,
            (numAmount > 0 && !isActionDisabled) || isDiscovering
              ? [styles.borrowBtnActive, { backgroundColor: colors.primary }]
              : [styles.borrowBtnInactive, { borderColor: colors.cardBorder }],
          ]}
          onPress={handlePrimaryPress}
          disabled={isActionDisabled || isSubmitting}
          activeOpacity={0.88}
        >
          {isSubmitting || isDiscovering ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={[styles.borrowBtnText, { color: '#FFFFFF' }]}>
                {getCtaLabel()}
              </Text>
            </View>
          ) : (
            <Text
              style={[
                styles.borrowBtnText,
                { color: (numAmount > 0 && !isActionDisabled) ? '#FFFFFF' : colors.text },
              ]}
            >
              {getCtaLabel()}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Dropdown Modal to Choose Collateral Currency ── */}
      <Modal
        visible={showCollateralModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCollateralModal(false)}
      >
        <View style={styles.dropdownModalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowCollateralModal(false)}
          />
          <View style={[styles.dropdownModalContent, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.dropdownModalHeader}>
              <Text style={[styles.dropdownModalTitle, { color: colors.text }]}>Select Collateral Asset</Text>
              <TouchableOpacity onPress={() => setShowCollateralModal(false)}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {([
              {
                id: 'SKR' as const,
                name: 'Seeker Reputation Bond (SKR)',
                price: skrPrice,
                balance: skrBalance,
                logo: SKR_LOGO,
              },
              {
                id: 'SOL' as const,
                name: 'Native Solana (SOL)',
                price: solPrice,
                balance: solBalance,
                logo: SOL_LOGO,
              },
            ]).map((asset) => {
              const isSelected = collateralType === asset.id;
              return (
                <TouchableOpacity
                  key={asset.id}
                  style={[
                    styles.assetItem,
                    { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder },
                    isSelected && { borderColor: colors.primary, backgroundColor: colors.badgeBg },
                  ]}
                  onPress={() => {
                    try { Haptics.selectionAsync(); } catch {}
                    setCollateralType(asset.id);
                    setShowCollateralModal(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Image source={asset.logo} style={styles.assetItemLogo} resizeMode="contain" />
                  <View style={styles.assetItemInfo}>
                    <Text style={[styles.assetItemSymbol, { color: colors.text }]}>{asset.id}</Text>
                    <Text style={[styles.assetItemName, { color: colors.textMuted }]}>{asset.name}</Text>
                  </View>
                  <View style={styles.assetItemRight}>
                    <Text style={[styles.assetItemBalance, { color: colors.text }]}>
                      {asset.balance.toFixed(asset.id === 'SOL' ? 3 : 0)}
                    </Text>
                    <Text style={[styles.assetItemPrice, { color: colors.textMuted }]}>
                      ${asset.price.toFixed(asset.id === 'SOL' ? 2 : 4)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

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
                colors={mode === 'dark' ? ['#172554', '#1E40AF', '#2563EB'] : ['#1E3A8A', '#1D4ED8', '#2563EB']}
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
  walletChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  inputBox: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
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
    fontSize: 11,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  numberInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '900',
    paddingVertical: 2,
  },
  collateralAmountText: {
    flex: 1,
    fontSize: 26,
    fontWeight: '900',
    paddingVertical: 2,
  },
  tokenTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  tokenIconText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
  },
  tokenTagText: {
    fontSize: 13,
    fontWeight: '800',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  dropdownIcon: {
    width: 18,
    height: 18,
  },
  dropdownText: {
    fontSize: 13,
    fontWeight: '800',
  },
  durationSection: {
    marginTop: 22,
  },
  durationLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  durationPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  durationPill: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  summaryPanel: {
    marginTop: 22,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  borrowBtn: {
    marginTop: 26,
    borderRadius: 20,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  borrowBtnActive: {
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  borrowBtnInactive: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  borrowBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  borrowBtnText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  dropdownModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dropdownModalContent: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  dropdownModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dropdownModalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  assetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  assetItemLogo: {
    width: 32,
    height: 32,
  },
  assetItemInfo: {
    flex: 1,
  },
  assetItemSymbol: {
    fontSize: 15,
    fontWeight: '800',
  },
  assetItemName: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  assetItemRight: {
    alignItems: 'flex-end',
  },
  assetItemBalance: {
    fontSize: 14,
    fontWeight: '700',
  },
  assetItemPrice: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
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
    shadowColor: '#1D4ED8',
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
