import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { LendingPool, P2POffer, WalletAssets } from '../types';
import {
  maxP2PInterestOffered,
  calculateOriginationFee,
  isNativeSolCollateralName,
} from '../solana/onChainService';

const SkeletonPulse: React.FC<{ style?: any }> = ({ style }) => {
  const pulseAnim = React.useRef(new Animated.Value(0.35)).current;
  const { colors } = useTheme();

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.85,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        { backgroundColor: colors.cardAlt, borderRadius: 8 },
        style,
        { opacity: pulseAnim },
      ]}
    />
  );
};

const DeskSkeleton: React.FC = () => {
  const { colors } = useTheme();
  return (
    <View style={[styles.deskCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.deskHeader}>
        <View style={styles.deskLeft}>
          <SkeletonPulse style={{ width: 40, height: 40, borderRadius: 20 }} />
          <View style={{ gap: 6 }}>
            <SkeletonPulse style={{ width: 140, height: 16 }} />
            <SkeletonPulse style={{ width: 90, height: 12 }} />
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <SkeletonPulse style={{ width: 60, height: 18 }} />
          <SkeletonPulse style={{ width: 45, height: 12 }} />
        </View>
      </View>
      <View style={[styles.deskFooter, { borderTopColor: colors.cardBorder }]}>
        <SkeletonPulse style={{ width: 100, height: 14 }} />
        <SkeletonPulse style={{ width: 88, height: 32, borderRadius: 16 }} />
      </View>
    </View>
  );
};

const PawnSkeleton: React.FC = () => {
  const { colors } = useTheme();
  return (
    <View style={[styles.deskCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={styles.deskHeader}>
        <View style={styles.deskLeft}>
          <SkeletonPulse style={{ width: 40, height: 40, borderRadius: 20 }} />
          <View style={{ gap: 6 }}>
            <SkeletonPulse style={{ width: 130, height: 16 }} />
            <SkeletonPulse style={{ width: 95, height: 12 }} />
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <SkeletonPulse style={{ width: 55, height: 18 }} />
          <SkeletonPulse style={{ width: 50, height: 12 }} />
        </View>
      </View>
      <View style={[styles.deskFooter, { borderTopColor: colors.cardBorder }]}>
        <SkeletonPulse style={{ width: 80, height: 14 }} />
        <SkeletonPulse style={{ width: 90, height: 32, borderRadius: 16 }} />
      </View>
    </View>
  );
};

const ErrorStateCard: React.FC<{ onRetry?: () => void; message?: string }> = ({ onRetry, message }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.errorCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <View style={[styles.errorIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.danger} />
      </View>
      <Text style={[styles.errorTitle, { color: colors.text }]}>Unable to Connect to Markets</Text>
      <Text style={[styles.errorSub, { color: colors.textSecondary }]}>
        {message || 'Could not fetch live on-chain lending desks from Solana. Please check your network and try again.'}
      </Text>
      {onRetry && (
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            onRetry();
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh" size={16} color="#FFFFFF" />
          <Text style={styles.retryBtnText}>Retry Connection</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

interface MerchantDesksViewProps {
  pools: LendingPool[];
  offers: P2POffer[];
  userPubkey?: string;
  walletAssets?: WalletAssets;
  onSelectPool: (pool: LendingPool) => void;
  onFundPawnOffer: (offerId: number) => void;
  onCreatePawnOffer: (name: string, reqAmount: number, profit: number, days: number) => void;
  onRepayPawnOffer?: (offer: P2POffer) => void;
  onCancelPawnOffer?: (offer: P2POffer) => void;
  onCreatePool?: (
    name: string,
    poolType: 'Individual' | 'Circle',
    aprPercent: number,
    maxLtvPercent: number,
    minDays: number,
    maxDays: number,
    initialLiquidity: number
  ) => void;
  onDepositLiquidity?: (pool: LendingPool, amount: number) => void;
  onWithdrawLiquidity?: (pool: LendingPool, amount: number) => void;
  onClaimPawnDefault?: (offer: P2POffer) => void;
  onTriggerPawnGrace?: (offer: P2POffer) => void;
  isLoading?: boolean;
  loadFailed?: boolean;
  poolsLoadFailed?: boolean;
  offersLoadFailed?: boolean;
  onRetry?: () => void;
}

export const MerchantDesksView: React.FC<MerchantDesksViewProps> = ({
  pools,
  offers,
  userPubkey,
  walletAssets,
  onSelectPool,
  onFundPawnOffer,
  onCreatePawnOffer,
  onRepayPawnOffer,
  onCancelPawnOffer,
  onCreatePool,
  onDepositLiquidity,
  onWithdrawLiquidity,
  onClaimPawnDefault,
  onTriggerPawnGrace,
  isLoading = false,
  loadFailed = false,
  poolsLoadFailed,
  offersLoadFailed,
  onRetry,
}) => {
  const { colors } = useTheme();
  const userUsdcBalance = walletAssets?.usdcBalance ?? 0;
  const [subTab, setSubTab] = useState<'POOLS' | 'PAWNS'>('POOLS');
  const [deskFilter, setDeskFilter] = useState<'ALL' | 'VERIFIED' | 'CIRCLES' | 'MY_DESKS'>('ALL');
  const [pawnFilter, setPawnFilter] = useState<'ALL' | 'MY_PAWNS' | 'FUNDED' | 'COMPLETED'>('ALL');

  // Create Pool Modal - use empty initial state with placeholders
  const [createPoolModal, setCreatePoolModal] = useState<boolean>(false);
  const [deskName, setDeskName] = useState<string>('');
  const [deskType, setDeskType] = useState<'Individual' | 'Circle'>('Individual');
  const [deskApr, setDeskApr] = useState<string>('');
  const [deskLtv, setDeskLtv] = useState<string>('');
  const [deskMinDays, setDeskMinDays] = useState<string>('');
  const [deskMaxDays, setDeskMaxDays] = useState<string>('');
  const [deskLiquidity, setDeskLiquidity] = useState<string>('');

  // Create Pawn Modal - use empty initial state with placeholders
  const [pawnModal, setPawnModal] = useState<boolean>(false);
  const [assetName, setAssetName] = useState<string>('');
  const [reqAmount, setReqAmount] = useState<string>('');
  const [profitAmount, setProfitAmount] = useState<string>('');
  const [duration, setDuration] = useState<string>('');

  // Deposit Liquidity state
  const [fundModal, setFundModal] = useState<LendingPool | null>(null);
  const [fundAmount, setFundAmount] = useState<string>('');

  // Withdraw Liquidity state
  const [withdrawModal, setWithdrawModal] = useState<LendingPool | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');

  const sanitizeText = (val: string, maxLen = 32) => val.replace(/[<>'"\\/]/g, '').slice(0, maxLen);
  const sanitizeDecimal = (val: string) => val.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
  const sanitizeInt = (val: string, maxLen = 4) => val.replace(/[^0-9]/g, '').slice(0, maxLen);

  const handleCreatePoolSubmit = () => {
    const apr = parseFloat(deskApr);
    const ltv = parseFloat(deskLtv);
    const minD = parseInt(deskMinDays, 10);
    const maxD = parseInt(deskMaxDays, 10);
    const liq = parseFloat(deskLiquidity);

    if (!deskName.trim()) {
      Alert.alert('Missing Name', 'Please enter a name for your lending desk.');
      return;
    }
    // The chain caps interest_rate_bps at 1000 — the rate is charged as a
    // percentage of principal per 30-day term, so 10 is the ceiling. Letting a
    // desk creator enter more here only produces a failed transaction.
    if (isNaN(apr) || apr <= 0 || apr > 10) {
      Alert.alert(
        'Invalid rate',
        'Enter a rate between 0 and 10%. This is charged as a percentage of the loan amount over a 30-day term, and the program caps it at 10%.'
      );
      return;
    }
    if (isNaN(ltv) || ltv <= 10 || ltv > 70) {
      Alert.alert('Invalid LTV', 'Max LTV must be between 10% and 70% (program cap).');
      return;
    }
    if (isNaN(minD) || isNaN(maxD) || minD < 1 || maxD < minD) {
      Alert.alert('Invalid Duration', 'Max duration must be greater than or equal to min duration.');
      return;
    }
    if (isNaN(liq) || liq <= 0) {
      Alert.alert('Invalid Liquidity', 'Please enter a valid initial liquidity amount.');
      return;
    }
    if (liq > userUsdcBalance) {
      Alert.alert(
        'Insufficient USDC Balance',
        `Your wallet has ${userUsdcBalance.toFixed(2)} USDC, which is less than the requested ${liq.toFixed(2)} USDC initial liquidity.\n\nPlease deposit or swap for USDC before initializing a lending desk.`
      );
      return;
    }

    setCreatePoolModal(false);
    if (onCreatePool) {
      onCreatePool(deskName.trim(), deskType, apr, ltv, minD, maxD, liq);
    }
  };

  const handleCreatePawnSubmit = () => {
    const amt = parseFloat(reqAmount);
    const prof = parseFloat(profitAmount);
    const d = parseInt(duration, 10);
    if (!assetName || isNaN(amt) || isNaN(prof) || isNaN(d) || amt <= 0 || prof < 0 || d <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid asset name, amount, and duration.');
      return;
    }
    // Mirror of the program's ceiling: interest is capped by TERM as well as by
    // principal, so a 1-day pawn cannot offer what a 30-day one may. Comparing
    // in micro-units as integers keeps this exact — the program divides
    // integers, so a float comparison could pass something the chain rejects.
    const maxProfitMicro = maxP2PInterestOffered(BigInt(Math.round(amt * 1e6)), d * 86400);
    const maxProfit = Number(maxProfitMicro) / 1e6;
    if (BigInt(Math.round(prof * 1e6)) > maxProfitMicro) {
      Alert.alert(
        'Interest Too High',
        `A ${d}-day pawn can offer at most ${maxProfit.toFixed(4)} USDC interest on ${amt} USDC.\n\nThe program caps interest at 10% of the amount borrowed per 30-day term, so longer terms allow proportionally more.`
      );
      return;
    }
    setPawnModal(false);
    setSubTab('PAWNS');
    onCreatePawnOffer(assetName, amt, prof, d);
  };

  // Filtered pools
  const filteredPools = pools.filter((pool) => {
    if (deskFilter === 'VERIFIED') return pool.isVerifiedMerchant;
    if (deskFilter === 'CIRCLES') return pool.poolType === 'Circle';
    if (deskFilter === 'MY_DESKS') return Boolean(userPubkey && pool.authority.toLowerCase() === userPubkey.toLowerCase());
    return true;
  });

  // Filtered pawns
  const filteredOffers = offers.filter((offer) => {
    if (pawnFilter === 'MY_PAWNS') return Boolean(userPubkey && offer.creator === userPubkey);
    if (pawnFilter === 'FUNDED') return Boolean(userPubkey && offer.funder === userPubkey);
    if (pawnFilter === 'COMPLETED') return offer.status === 'Repaid' || offer.status === 'Defaulted';
    return true;
  });

  const totalPoolLiquidity = pools.reduce((acc, p) => acc + p.totalLiquidity, 0);
  const minApr = pools.length > 0 ? Math.min(...pools.map((p) => p.interestRateBps / 100)) : 8.0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Top Header Row with ClockLend Logo (Matches 68a39554) ── */}
      <View style={styles.screenHeaderRow}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/logo.png')} style={styles.headerLogo} resizeMode="contain" />
          <Text style={[styles.screenTitle, { color: colors.text }]}>Markets</Text>
        </View>
        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (subTab === 'POOLS') setCreatePoolModal(true);
            else setPawnModal(true);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color={colors.primaryText} />
          <Text style={[styles.createBtnText, { color: colors.primaryText }]}>
            {subTab === 'POOLS' ? 'Desk' : 'Pawn'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Segmented Switcher ── */}
      <View style={styles.topBar}>
        <View style={[styles.segmentControl, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              subTab === 'POOLS' && { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1 },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSubTab('POOLS');
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentText,
                { color: colors.textSecondary },
                subTab === 'POOLS' && { color: colors.text, fontWeight: '800' },
              ]}
            >
              Lending Desks ({pools.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentBtn,
              subTab === 'PAWNS' && { backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1 },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSubTab('PAWNS');
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentText,
                { color: colors.textSecondary },
                subTab === 'PAWNS' && { color: colors.text, fontWeight: '800' },
              ]}
            >
              P2P Pawns ({offers.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
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
        {/* ── Market Hero Card ── */}
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.heroRow}>
            <View>
              <Text style={[styles.heroLabel, { color: colors.textMuted }]}>
                {subTab === 'POOLS' ? 'Total Mainnet Liquidity' : 'Active Pawn Listings'}
              </Text>
              <Text style={[styles.heroVal, { color: colors.text }]}>
                {subTab === 'POOLS'
                  ? `$${totalPoolLiquidity.toLocaleString()} USDC`
                  : `${offers.length} Escrow Offers`}
              </Text>
            </View>
            <View style={[styles.statPill, { backgroundColor: colors.badgeBg }]}>
              <Text style={[styles.statPillText, { color: colors.primaryLabel }]}>
                {subTab === 'POOLS' ? `From ${minApr.toFixed(1)}% per 30d` : 'Zero Liquidations'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── SubTab 1: Lending Desks ── */}
        {subTab === 'POOLS' && (
          <View>
            {/* Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
              {(['ALL', 'VERIFIED', 'CIRCLES', 'MY_DESKS'] as const).map((key) => {
                const isSel = deskFilter === key;
                const label =
                  key === 'ALL'
                    ? `All (${pools.length})`
                    : key === 'VERIFIED'
                    ? 'Verified'
                    : key === 'CIRCLES'
                    ? 'Circles'
                    : 'My Desks';
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.filterChip,
                      { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder },
                      isSel && { backgroundColor: colors.badgeBg, borderColor: colors.primary },
                    ]}
                    onPress={() => setDeskFilter(key)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: colors.textSecondary },
                        isSel && { color: colors.primaryLabel, fontWeight: '800' },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Loading Skeleton, Error State, or List */}
            {isLoading && filteredPools.length === 0 && !poolsLoadFailed && !loadFailed ? (
              <View>
                <DeskSkeleton />
                <DeskSkeleton />
                <DeskSkeleton />
              </View>
            ) : (poolsLoadFailed || loadFailed) && filteredPools.length === 0 ? (
              <ErrorStateCard
                onRetry={onRetry}
                message="Failed to read on-chain lending desks from Solana Mainnet. Please check your network and retry."
              />
            ) : filteredPools.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Ionicons name="storefront-outline" size={36} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Lending Desks Found</Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                  Be the first to initialize an on-chain lending desk with your own terms and liquidity!
                </Text>
                {onCreatePool && (
                  <TouchableOpacity
                    style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
                    onPress={() => setCreatePoolModal(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.emptyActionText, { color: colors.primaryText }]}>+ Create Lending Desk</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              filteredPools.map((pool) => {
                const isMyDesk = Boolean(userPubkey && pool.authority.toLowerCase() === userPubkey.toLowerCase());
                return (
                  <View
                    key={pool.id}
                    style={[
                      styles.deskCard,
                      { backgroundColor: colors.card, borderColor: isMyDesk ? colors.primary : colors.cardBorder },
                    ]}
                  >
                    <View style={styles.deskHeader}>
                      <View style={styles.deskLeft}>
                        <View
                          style={[
                            styles.deskGlyph,
                            { backgroundColor: pool.poolType === 'Circle' ? 'rgba(168, 85, 247, 0.15)' : colors.badgeBg },
                          ]}
                        >
                          <Ionicons
                            name={pool.poolType === 'Circle' ? 'people' : 'business'}
                            size={18}
                            color={pool.poolType === 'Circle' ? '#c084fc' : colors.primary}
                          />
                        </View>
                        <View>
                          <View style={styles.deskNameRow}>
                            <Text style={[styles.deskName, { color: colors.text }]}>{pool.name}</Text>
                            {pool.isVerifiedMerchant && (
                              <View style={[styles.miniBadge, { backgroundColor: colors.badgeBg }]}>
                                <Text style={[styles.miniBadgeText, { color: colors.primaryLabel }]}>VERIFIED</Text>
                              </View>
                            )}
                            {isMyDesk && (
                              <View style={[styles.miniBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                                <Text style={[styles.miniBadgeText, { color: '#F59E0B' }]}>YOURS</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[styles.deskTerms, { color: colors.textMuted }]}>
                            {pool.minDurationDays}-{pool.maxDurationDays}d term • {(pool.maxLtvBps / 100).toFixed(0)}% Max LTV
                          </Text>
                        </View>
                      </View>

                      <View style={styles.deskRight}>
                        <Text style={[styles.deskApr, { color: colors.primaryLabel }]}>
                          {(pool.interestRateBps / 100).toFixed(1)}%
                        </Text>
                        <Text style={[styles.deskAprLabel, { color: colors.textMuted }]}>per 30 days</Text>
                      </View>
                    </View>

                    <View style={[styles.deskFooter, { borderTopColor: colors.cardBorder }]}>
                      <View style={styles.liquidityInfo}>
                        <Text style={[styles.liqLabel, { color: colors.textMuted }]}>Available Liquidity</Text>
                        <Text style={[styles.liqVal, { color: colors.text }]}>
                          ${pool.totalLiquidity.toLocaleString()} USDC
                        </Text>
                      </View>

                      <View style={styles.actionBtnRow}>
                        {isMyDesk && onDepositLiquidity && (
                          <TouchableOpacity
                            style={[styles.fundSmallBtn, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
                            onPress={() => setFundModal(pool)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.fundSmallBtnText, { color: colors.primaryLabel }]}>+ Deposit</Text>
                          </TouchableOpacity>
                        )}
                        {isMyDesk && onWithdrawLiquidity && pool.totalLiquidity > 0 && (
                          <TouchableOpacity
                            style={[styles.fundSmallBtn, { backgroundColor: colors.cardAlt, borderColor: 'rgba(239, 68, 68, 0.4)' }]}
                            onPress={() => {
                              setWithdrawAmount('');
                              setWithdrawModal(pool);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.fundSmallBtnText, { color: colors.danger }]}>Withdraw</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[styles.borrowActionBtn, { backgroundColor: colors.primary }]}
                          onPress={() => onSelectPool(pool)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.borrowActionBtnText, { color: colors.primaryText }]}>Borrow →</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── SubTab 2: P2P Pawns ── */}
        {subTab === 'PAWNS' && (
          <View>
            {/* Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
              {[
                { id: 'ALL', label: `All (${offers.length})` },
                { id: 'MY_PAWNS', label: 'My Pawns' },
                { id: 'FUNDED', label: 'Funded' },
                { id: 'COMPLETED', label: 'Completed' },
              ].map((f) => {
                const isSel = pawnFilter === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[
                      styles.filterChip,
                      { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder },
                      isSel && { backgroundColor: colors.badgeBg, borderColor: colors.primary },
                    ]}
                    onPress={() => setPawnFilter(f.id as any)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: colors.textSecondary },
                        isSel && { color: colors.primaryLabel, fontWeight: '800' },
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Loading Skeleton, Error State, or Pawn Offer List */}
            {isLoading && filteredOffers.length === 0 && !offersLoadFailed && !loadFailed ? (
              <View>
                <PawnSkeleton />
                <PawnSkeleton />
              </View>
            ) : (offersLoadFailed || loadFailed) && filteredOffers.length === 0 ? (
              <ErrorStateCard
                onRetry={onRetry}
                message="Failed to read peer-to-peer pawn offers from Solana Mainnet. Please check your network and retry."
              />
            ) : filteredOffers.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Ionicons name="pricetag-outline" size={36} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No P2P Pawns Listed</Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                  List custom collateral in escrow to request direct USDC liquidity from peers.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setPawnModal(true)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.emptyActionText, { color: colors.primaryText }]}>+ Create P2P Pawn</Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredOffers.map((offer) => {
                const isCreator = Boolean(userPubkey && offer.creator.toLowerCase() === userPubkey.toLowerCase());
                const isFunder = Boolean(userPubkey && offer.funder && offer.funder.toLowerCase() === userPubkey.toLowerCase());
                const isOpen = offer.status === 'Open';
                const isFunded = offer.status === 'Funded';
                const isInGrace = offer.status === 'InGracePeriod';
                const isRepaid = offer.status === 'Repaid';
                const isDefaulted = offer.status === 'Defaulted';
                const nowSec = Math.floor(Date.now() / 1000);
                const isPastDue = Boolean(offer.dueTime && nowSec >= offer.dueTime);
                const isGraceExpired = Boolean(
                  (offer.gracePeriodExpires && nowSec >= offer.gracePeriodExpires) ||
                  (offer.dueTime && nowSec >= offer.dueTime + 86400)
                );

                const statusColor = isOpen
                  ? '#34D399'
                  : isInGrace
                  ? colors.danger
                  : isFunded
                  ? isPastDue
                    ? colors.warning
                    : '#38BDF8'
                  : isRepaid
                  ? '#10B981'
                  : colors.danger;

                const statusLabel = isOpen
                  ? 'OPEN'
                  : isInGrace
                  ? '24H GRACE'
                  : isFunded
                  ? isPastDue
                    ? 'PAST DUE'
                    : 'FUNDED'
                  : offer.status.toUpperCase();

                return (
                  <View
                    key={offer.id}
                    style={[
                      styles.deskCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: isInGrace ? colors.danger : colors.cardBorder,
                      },
                    ]}
                  >
                    <View style={styles.deskHeader}>
                      <View style={styles.deskLeft}>
                        <View style={[styles.deskGlyph, { backgroundColor: colors.badgeBg }]}>
                          <Ionicons name="cube-outline" size={18} color={colors.primary} />
                        </View>
                        <View>
                          <Text style={[styles.deskName, { color: colors.text }]}>{offer.collateralName}</Text>
                          <Text style={[styles.deskTerms, { color: colors.textMuted }]}>
                            {offer.durationDays}d term • ${offer.requestedAmount} USDC Loan
                          </Text>
                        </View>
                      </View>

                      <View style={styles.deskRight}>
                        <Text style={[styles.deskApr, { color: colors.primaryLabel }]}>
                          +${offer.interestOffered.toFixed(2)}
                        </Text>
                        <Text style={[styles.deskAprLabel, { color: colors.textMuted }]}>Lender Profit</Text>
                      </View>
                    </View>

                    {/* Timeline status note if funded or in grace */}
                    {(isFunded || isInGrace) && (
                      <View style={{ marginHorizontal: 16, marginTop: 4, marginBottom: 8, padding: 8, borderRadius: 8, backgroundColor: isInGrace ? 'rgba(239, 68, 68, 0.1)' : colors.cardAlt }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: isInGrace ? colors.danger : isPastDue ? colors.warning : colors.textSecondary }}>
                          {isInGrace
                            ? isGraceExpired
                              ? '⚠️ 24h grace expired • Collateral liquidatable by funder'
                              : `🚨 24h Social Grace active • Expires in ${Math.max(1, Math.ceil(((offer.gracePeriodExpires || (offer.dueTime || 0) + 86400) - nowSec) / 3600))}h`
                            : isPastDue
                            ? '⚠️ Repayment past due • 24h grace period can be triggered'
                            : offer.dueTime
                            ? `⏳ Active Loan • Due in ${Math.max(1, Math.ceil((offer.dueTime - nowSec) / 86400))}d`
                            : 'Active Loan'}
                        </Text>
                      </View>
                    )}

                    <View style={[styles.deskFooter, { borderTopColor: colors.cardBorder }]}>
                      <View style={styles.liquidityInfo}>
                        <View style={styles.statusRow}>
                          <View
                            style={[
                              styles.statusDot,
                              { backgroundColor: statusColor },
                            ]}
                          />
                          <Text style={[styles.liqVal, { color: colors.text }]}>{statusLabel}</Text>
                        </View>
                      </View>

                      <View style={styles.actionBtnRow}>
                        {isOpen && !isCreator && (
                          <TouchableOpacity
                            style={[styles.borrowActionBtn, { backgroundColor: colors.primary }]}
                            onPress={() => onFundPawnOffer(offer.id)}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.borrowActionBtnText, { color: colors.primaryText }]}>Fund Loan →</Text>
                          </TouchableOpacity>
                        )}
                        {isOpen && isCreator && onCancelPawnOffer && (
                          <TouchableOpacity
                            style={[styles.fundSmallBtn, { borderColor: colors.danger }]}
                            onPress={() => onCancelPawnOffer(offer)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.fundSmallBtnText, { color: colors.danger }]}>Cancel Pawn</Text>
                          </TouchableOpacity>
                        )}
                        {/* Repay is possible during Funded OR while inside Grace Period */}
                        {(isFunded || isInGrace) && isCreator && onRepayPawnOffer && (
                          <TouchableOpacity
                            style={[styles.borrowActionBtn, { backgroundColor: colors.primary }]}
                            onPress={() => onRepayPawnOffer(offer)}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.borrowActionBtnText, { color: colors.primaryText }]}>
                              Repay & Unlock
                            </Text>
                          </TouchableOpacity>
                        )}
                        {/* Trigger Grace Period when funded and past due */}
                        {isFunded && isPastDue && onTriggerPawnGrace && (isCreator || isFunder) && (
                          <TouchableOpacity
                            style={[styles.fundSmallBtn, { borderColor: colors.warning }]}
                            onPress={() => onTriggerPawnGrace(offer)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.fundSmallBtnText, { color: colors.warning }]}>24h Grace</Text>
                          </TouchableOpacity>
                        )}
                        {/* Claim Default when grace period expired and caller is funder */}
                        {isInGrace && isGraceExpired && onClaimPawnDefault && isFunder && (
                          <TouchableOpacity
                            style={[styles.fundSmallBtn, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: colors.danger }]}
                            onPress={() => onClaimPawnDefault(offer)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.fundSmallBtnText, { color: colors.danger, fontWeight: '800' }]}>Claim Default</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Create Lending Desk Modal ── */}
      <Modal
        visible={createPoolModal}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setCreatePoolModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback onPress={() => setCreatePoolModal(false)}>
            <View style={styles.modalDismissArea} />
          </TouchableWithoutFeedback>

          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Create Lending Desk</Text>
              <TouchableOpacity
                onPress={() => setCreatePoolModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 28 }}
            >
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>DESK NAME</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                value={deskName}
                onChangeText={(val) => setDeskName(sanitizeText(val))}
                placeholder="e.g. Seeker Alpha Vault"
                placeholderTextColor={colors.textMuted}
              />

              <View style={styles.inputSplitRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>RATE PER 30 DAYS (MAX 10%)</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                    value={deskApr}
                    onChangeText={(val) => setDeskApr(sanitizeDecimal(val))}
                    keyboardType="decimal-pad"
                    placeholder="8.0"
                    placeholderTextColor={colors.textMuted}
                  />
                  {parseFloat(deskApr) > 0 && (
                    <Text style={{ fontSize: 10, color: colors.primaryLabel, marginTop: 4, fontWeight: '600' }}>
                      ≈ {((parseFloat(deskApr) * 7) / 30).toFixed(2)}% / 7d ({parseFloat(deskApr).toFixed(2)}% / 30d)
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>MAX LTV (%)</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                    value={deskLtv}
                    onChangeText={(val) => setDeskLtv(sanitizeDecimal(val))}
                    keyboardType="decimal-pad"
                    placeholder="70"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>

              <View style={styles.inputSplitRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>MIN DURATION (DAYS)</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                    value={deskMinDays}
                    onChangeText={(val) => setDeskMinDays(sanitizeInt(val))}
                    keyboardType="number-pad"
                    placeholder="7"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>MAX DURATION (DAYS)</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                    value={deskMaxDays}
                    onChangeText={(val) => setDeskMaxDays(sanitizeInt(val))}
                    keyboardType="number-pad"
                    placeholder="30"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 6 }}>
                <Text style={[styles.inputLabel, { color: colors.textMuted, marginTop: 0, marginBottom: 0 }]}>INITIAL LIQUIDITY (USDC)</Text>
                <TouchableOpacity
                  onPress={() => setDeskLiquidity(userUsdcBalance > 0 ? userUsdcBalance.toString() : '0')}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 11, color: colors.primaryLabel, fontWeight: '700' }}>
                    Balance: ${userUsdcBalance.toFixed(2)} (Max)
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: !isNaN(parseFloat(deskLiquidity)) && parseFloat(deskLiquidity) > userUsdcBalance ? colors.danger : colors.cardBorder,
                    color: colors.text,
                  },
                ]}
                value={deskLiquidity}
                onChangeText={(val) => setDeskLiquidity(sanitizeDecimal(val))}
                keyboardType="decimal-pad"
                placeholder={userUsdcBalance > 0 ? `Max ${userUsdcBalance.toFixed(2)}` : '0.00'}
                placeholderTextColor={colors.textMuted}
              />
              {!isNaN(parseFloat(deskLiquidity)) && parseFloat(deskLiquidity) > userUsdcBalance && (
                <Text style={{ fontSize: 11, color: colors.danger, marginTop: 4, fontWeight: '600' }}>
                  ⚠️ Exceeds your wallet balance (${userUsdcBalance.toFixed(2)} USDC). Please reduce amount.
                </Text>
              )}

              <TouchableOpacity
                style={[
                  styles.modalSubmitBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: !isNaN(parseFloat(deskLiquidity)) && parseFloat(deskLiquidity) > userUsdcBalance ? 0.6 : 1,
                  },
                ]}
                onPress={handleCreatePoolSubmit}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalSubmitText, { color: colors.primaryText }]}>Initialize Desk On-Chain</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Create P2P Pawn Modal ── */}
      <Modal
        visible={pawnModal}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setPawnModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback onPress={() => setPawnModal(false)}>
            <View style={styles.modalDismissArea} />
          </TouchableWithoutFeedback>

          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>List P2P Pawn</Text>
              <TouchableOpacity
                onPress={() => setPawnModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 28 }}
            >
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>COLLATERAL ASSET</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                value={assetName}
                onChangeText={(val) => setAssetName(sanitizeText(val))}
                placeholder="e.g. 1,000 SKR or 1 SOL"
                placeholderTextColor={colors.textMuted}
              />

              <View style={styles.inputSplitRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>BORROW (USDC)</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                    value={reqAmount}
                    onChangeText={(val) => setReqAmount(sanitizeDecimal(val))}
                    keyboardType="decimal-pad"
                    placeholder="25"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>PROFIT (USDC)</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                    value={profitAmount}
                    onChangeText={(val) => setProfitAmount(sanitizeDecimal(val))}
                    keyboardType="decimal-pad"
                    placeholder="2.50"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>

              {(() => {
                // Disclose the withholding up front. The program takes an
                // origination fee (25 bps for SOL collateral, 50 bps for SKR)
                // out of the disbursement, so the creator receives less than
                // they ask for. Silently shorting them would be the wrong
                // surprise to leave to the signature screen.
                const amt = parseFloat(reqAmount);
                if (!(amt > 0)) return null;
                const isSol = isNativeSolCollateralName(assetName);
                const { feeMicro, netMicro } = calculateOriginationFee(
                  BigInt(Math.round(amt * 1e6)),
                  isSol
                );
                return (
                  <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: -6, marginBottom: 10, fontWeight: '600' }}>
                    You receive {Number(netMicro) / 1e6} USDC — {Number(feeMicro) / 1e6} USDC
                    origination fee ({isSol ? '0.25' : '0.50'}%)
                  </Text>
                );
              })()}

              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>DURATION (DAYS)</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                value={duration}
                onChangeText={(val) => setDuration(sanitizeInt(val))}
                keyboardType="number-pad"
                placeholder="7"
                placeholderTextColor={colors.textMuted}
              />

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }]}
                onPress={handleCreatePawnSubmit}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalSubmitText, { color: colors.primaryText }]}>Lock Collateral & List</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Deposit Liquidity Modal ── */}
      {fundModal && (
        <Modal
          visible={!!fundModal}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={() => setFundModal(null)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <TouchableWithoutFeedback onPress={() => setFundModal(null)}>
              <View style={styles.modalDismissArea} />
            </TouchableWithoutFeedback>

            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Deposit into {fundModal.name}</Text>
                <TouchableOpacity
                  onPress={() => setFundModal(null)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 6 }}>
                <Text style={[styles.inputLabel, { color: colors.textMuted, marginTop: 0, marginBottom: 0 }]}>DEPOSIT AMOUNT (USDC)</Text>
                <TouchableOpacity
                  onPress={() => setFundAmount(userUsdcBalance > 0 ? userUsdcBalance.toString() : '0')}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 11, color: colors.primaryLabel, fontWeight: '700' }}>
                    Balance: ${userUsdcBalance.toFixed(2)} (Max)
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                value={fundAmount}
                onChangeText={(val) => setFundAmount(sanitizeDecimal(val))}
                keyboardType="decimal-pad"
                placeholder={userUsdcBalance > 0 ? `Max ${userUsdcBalance.toFixed(2)}` : '0.00'}
                placeholderTextColor={colors.textMuted}
              />

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  const amt = parseFloat(fundAmount);
                  if (isNaN(amt) || amt <= 0) {
                    Alert.alert('Invalid Amount', 'Please enter a valid amount to deposit.');
                    return;
                  }
                  if (amt > userUsdcBalance) {
                    Alert.alert(
                      'Insufficient USDC Balance',
                      `Your wallet has ${userUsdcBalance.toFixed(2)} USDC, which is less than the requested ${amt.toFixed(2)} USDC deposit.\n\nPlease deposit or swap for USDC before funding.`
                    );
                    return;
                  }
                  if (onDepositLiquidity) {
                    onDepositLiquidity(fundModal, amt);
                    setFundModal(null);
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalSubmitText, { color: colors.primaryText }]}>Deposit Liquidity</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* ── Withdraw Liquidity Modal ── */}
      {withdrawModal && (
        <Modal
          visible={!!withdrawModal}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={() => setWithdrawModal(null)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <TouchableWithoutFeedback onPress={() => setWithdrawModal(null)}>
              <View style={styles.modalDismissArea} />
            </TouchableWithoutFeedback>

            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Withdraw from {withdrawModal.name}</Text>
                <TouchableOpacity
                  onPress={() => setWithdrawModal(null)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 6 }}>
                <Text style={[styles.inputLabel, { color: colors.textMuted, marginTop: 0, marginBottom: 0 }]}>WITHDRAW AMOUNT (USDC)</Text>
                <TouchableOpacity
                  onPress={() => setWithdrawAmount(withdrawModal.totalLiquidity.toString())}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 11, color: colors.primaryLabel, fontWeight: '700' }}>
                    Available: ${withdrawModal.totalLiquidity.toFixed(2)} (Max)
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                value={withdrawAmount}
                onChangeText={(val) => setWithdrawAmount(sanitizeDecimal(val))}
                keyboardType="decimal-pad"
                placeholder={`Max ${withdrawModal.totalLiquidity.toFixed(2)}`}
                placeholderTextColor={colors.textMuted}
              />

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: colors.danger }]}
                onPress={() => {
                  const amt = parseFloat(withdrawAmount);
                  if (isNaN(amt) || amt <= 0) {
                    Alert.alert('Invalid Amount', 'Please enter a valid amount to withdraw.');
                    return;
                  }
                  if (amt > withdrawModal.totalLiquidity) {
                    Alert.alert(
                      'Exceeds Available Liquidity',
                      `The desk has ${withdrawModal.totalLiquidity.toFixed(2)} USDC available, which is less than the requested ${amt.toFixed(2)} USDC withdrawal.`
                    );
                    return;
                  }
                  if (onWithdrawLiquidity) {
                    onWithdrawLiquidity(withdrawModal, amt);
                    setWithdrawModal(null);
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalSubmitText, { color: '#FFFFFF' }]}>Withdraw to Wallet</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 8,
  },
  screenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
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
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  segmentControl: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 11,
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  createBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  heroVal: {
    fontSize: 22,
    fontWeight: '800',
  },
  statPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyBox: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyActionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  deskCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  deskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deskLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  deskGlyph: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deskNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deskName: {
    fontSize: 15,
    fontWeight: '700',
  },
  miniBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  miniBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  deskTerms: {
    fontSize: 12,
    marginTop: 2,
  },
  deskRight: {
    alignItems: 'flex-end',
  },
  deskApr: {
    fontSize: 17,
    fontWeight: '800',
  },
  deskAprLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  deskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    marginTop: 12,
  },
  liquidityInfo: {},
  liqLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  liqVal: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 1,
  },
  actionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fundSmallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
  },
  fundSmallBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  borrowActionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  borrowActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 20,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 10,
  },
  modalInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  inputSplitRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalSubmitBtn: {
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 10,
  },
  modalSubmitText: {
    fontSize: 15,
    fontWeight: '800',
  },
  errorCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginVertical: 12,
  },
  errorIconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSub: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
    marginBottom: 18,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
