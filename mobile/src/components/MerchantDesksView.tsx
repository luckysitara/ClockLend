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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { LendingPool, P2POffer } from '../types';

interface MerchantDesksViewProps {
  pools: LendingPool[];
  offers: P2POffer[];
  userPubkey?: string;
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
  onSelectPool,
  onFundPawnOffer,
  onCreatePawnOffer,
  onRepayPawnOffer,
  onCancelPawnOffer,
  onCreatePool,
  onDepositLiquidity,
  isLoading = false,
  loadFailed = false,
  poolsLoadFailed,
  offersLoadFailed,
  onRetry,
}) => {
  const { colors } = useTheme();
  const [subTab, setSubTab] = useState<'POOLS' | 'PAWNS'>('POOLS');
  const [deskFilter, setDeskFilter] = useState<'ALL' | 'VERIFIED' | 'CIRCLES' | 'MY_DESKS'>('ALL');
  const [pawnFilter, setPawnFilter] = useState<'ALL' | 'MY_PAWNS' | 'FUNDED' | 'COMPLETED'>('ALL');

  // Create Pool Modal
  const [createPoolModal, setCreatePoolModal] = useState<boolean>(false);
  const [deskName, setDeskName] = useState<string>('Solana Chad Vault');
  const [deskType, setDeskType] = useState<'Individual' | 'Circle'>('Individual');
  const [deskApr, setDeskApr] = useState<string>('8.0');
  const [deskLtv, setDeskLtv] = useState<string>('70');
  const [deskMinDays, setDeskMinDays] = useState<string>('7');
  const [deskMaxDays, setDeskMaxDays] = useState<string>('30');
  const [deskLiquidity, setDeskLiquidity] = useState<string>('500');

  // Create Pawn Modal
  const [pawnModal, setPawnModal] = useState<boolean>(false);
  const [assetName, setAssetName] = useState<string>('1,000 SKR');
  const [reqAmount, setReqAmount] = useState<string>('20');
  const [profitAmount, setProfitAmount] = useState<string>('2');
  const [duration, setDuration] = useState<string>('7');

  // Deposit Liquidity state
  const [fundModal, setFundModal] = useState<LendingPool | null>(null);
  const [fundAmount, setFundAmount] = useState<string>('100');

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
    if (isNaN(apr) || apr <= 0 || apr > 100) {
      Alert.alert('Invalid APR', 'Please enter a valid fixed APR between 1% and 100%.');
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

    setCreatePoolModal(false);
    if (onCreatePool) {
      onCreatePool(deskName.trim(), deskType, apr, ltv, minD, maxD, liq);
    }
  };

  const handleCreatePawnSubmit = () => {
    const amt = parseFloat(reqAmount);
    const prof = parseFloat(profitAmount);
    const d = parseInt(duration, 10);
    if (!assetName || isNaN(amt) || isNaN(prof) || isNaN(d) || amt <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid asset name, amount, and duration.');
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
                {subTab === 'POOLS' ? `From ${minApr.toFixed(1)}% APR` : 'Zero Liquidations'}
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

            {/* Empty or List */}
            {filteredPools.length === 0 ? (
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
                        <Text style={[styles.deskAprLabel, { color: colors.textMuted }]}>Fixed APR</Text>
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

            {/* Pawn Offer List */}
            {filteredOffers.length === 0 ? (
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
                const isCreator = Boolean(userPubkey && offer.creator === userPubkey);
                const isFunder = Boolean(userPubkey && offer.funder === userPubkey);
                const isOpen = offer.status === 'Open';
                const isFunded = offer.status === 'Funded';

                return (
                  <View
                    key={offer.id}
                    style={[styles.deskCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
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

                    <View style={[styles.deskFooter, { borderTopColor: colors.cardBorder }]}>
                      <View style={styles.liquidityInfo}>
                        <View style={styles.statusRow}>
                          <View
                            style={[
                              styles.statusDot,
                              { backgroundColor: isOpen ? '#34D399' : isFunded ? '#F59E0B' : colors.textMuted },
                            ]}
                          />
                          <Text style={[styles.liqVal, { color: colors.text }]}>{offer.status.toUpperCase()}</Text>
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
                        {isFunded && isCreator && onRepayPawnOffer && (
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
      <Modal visible={createPoolModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Create Lending Desk</Text>
              <TouchableOpacity onPress={() => setCreatePoolModal(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>DESK NAME</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                value={deskName}
                onChangeText={setDeskName}
                placeholder="e.g. Seeker Alpha Vault"
                placeholderTextColor={colors.textMuted}
              />

              <View style={styles.inputSplitRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>FIXED APR (%)</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                    value={deskApr}
                    onChangeText={setDeskApr}
                    keyboardType="decimal-pad"
                    placeholder="8.0"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>MAX LTV (%)</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                    value={deskLtv}
                    onChangeText={setDeskLtv}
                    keyboardType="decimal-pad"
                    placeholder="70"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>

              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>INITIAL LIQUIDITY (USDC)</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                value={deskLiquidity}
                onChangeText={setDeskLiquidity}
                keyboardType="decimal-pad"
                placeholder="500"
                placeholderTextColor={colors.textMuted}
              />

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }]}
                onPress={handleCreatePoolSubmit}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalSubmitText, { color: colors.primaryText }]}>Initialize Desk On-Chain</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Create P2P Pawn Modal ── */}
      <Modal visible={pawnModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>List P2P Pawn</Text>
              <TouchableOpacity onPress={() => setPawnModal(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>COLLATERAL ASSET</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                value={assetName}
                onChangeText={setAssetName}
                placeholder="e.g. 1,000 SKR or 1 SOL"
                placeholderTextColor={colors.textMuted}
              />

              <View style={styles.inputSplitRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>BORROW (USDC)</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                    value={reqAmount}
                    onChangeText={setReqAmount}
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
                    onChangeText={setProfitAmount}
                    keyboardType="decimal-pad"
                    placeholder="2.50"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>

              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>DURATION (DAYS)</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                value={duration}
                onChangeText={setDuration}
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
        </View>
      </Modal>

      {/* ── Deposit Liquidity Modal ── */}
      {fundModal && (
        <Modal visible={!!fundModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Deposit into {fundModal.name}</Text>
                <TouchableOpacity onPress={() => setFundModal(null)}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>DEPOSIT AMOUNT (USDC)</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder, color: colors.text }]}
                value={fundAmount}
                onChangeText={setFundAmount}
                keyboardType="decimal-pad"
                placeholder="100"
                placeholderTextColor={colors.textMuted}
              />

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  const amt = parseFloat(fundAmount);
                  if (!isNaN(amt) && amt > 0 && onDepositLiquidity) {
                    onDepositLiquidity(fundModal, amt);
                    setFundModal(null);
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalSubmitText, { color: colors.primaryText }]}>Deposit Liquidity</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 20,
    maxHeight: '85%',
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
});
