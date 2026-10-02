import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { UserProfile, WalletAssets } from '../types';
import {
  SkrYieldVaultState,
  UserYieldPositionState,
  tierDiscountLabel,
  livePrices,
} from '../solana/onChainService';
import {
  isLockEnabled,
  setLockEnabled,
} from '../services/securityService';
import { SettingsView } from './SettingsModal';

interface CreditProfileViewProps {
  userProfile: UserProfile;
  skrHandle: string;
  walletAssets?: WalletAssets;
  onStakeSkr: (amount: number) => void;
  onUnstakeSkr?: (amount: number) => void;
  onOpenAssetsModal?: () => void;
  onDisconnectWallet: () => void;
  onLockApp?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenJudgeBriefing?: () => void;
  yieldVault?: SkrYieldVaultState;
  yieldPosition?: UserYieldPositionState;
  onClaimYield?: () => void;
}

export const CreditProfileView: React.FC<CreditProfileViewProps> = ({
  userProfile,
  skrHandle,
  walletAssets,
  onStakeSkr,
  onUnstakeSkr,
  onOpenAssetsModal,
  onDisconnectWallet,
  onLockApp,
  onOpenLeaderboard,
  onOpenJudgeBriefing,
  yieldVault,
  yieldPosition,
  onClaimYield,
}) => {
  const { colors, mode } = useTheme();
  const [subView, setSubView] = useState<'PROFILE' | 'SETTINGS'>('PROFILE');
  const [lockEnabled, setLockEnabledState] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Staking & Unstaking modal state
  const [showStakeModal, setShowStakeModal] = useState<boolean>(false);
  const [showUnstakeModal, setShowUnstakeModal] = useState<boolean>(false);
  const [stakeInput, setStakeInput] = useState<string>('');
  const [unstakeInput, setUnstakeInput] = useState<string>('');

  useEffect(() => {
    loadSecurityPrefs();
  }, []);

  const loadSecurityPrefs = async () => {
    const l = await isLockEnabled();
    setLockEnabledState(l);
  };

  const handleToggleLock = async (val: boolean) => {
    await setLockEnabled(val);
    setLockEnabledState(val);
  };

  const copyToClipboard = (text: string, label: string) => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
    Alert.alert('Copied to Clipboard', `${label}: ${text}`);
  };

  const shorten = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-8)}`;

  const sanitizeDecimal = (val: string): string => {
    return val.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
  };

  // Live Balances & Calculations
  const walletSkr = walletAssets?.skrBalance ?? 0;
  const stakedSkr = userProfile.stakedSkr ?? 0;
  const lockedSkr = userProfile.lockedSkr ?? 0;
  const availableToUnstake = Math.max(0, stakedSkr - lockedSkr);
  const skrPrice = livePrices.skr || 0.024;
  const stakedUsd = stakedSkr * skrPrice;
  const accruedUsd = (yieldPosition?.accruedRewards ?? 0) / 1_000_000;
  const totalClaimedUsd = (yieldPosition?.totalClaimed ?? 0) / 1_000_000;
  const canClaimYield = !!onClaimYield && accruedUsd > 0;
  const cleanHandle = skrHandle.replace(/^@/, '').replace(/\.skr$/i, '');
  const skrUsername = `${cleanHandle}.skr`;

  const calculateContinuousDiscount = (staked: number, locked: number = 0): number => {
    const available = Math.max(0, staked - locked);
    if (available < 100) return 0;
    if (available >= 10000) return 25;
    const bps = 100 + ((available - 100) * 2400) / 9900;
    return parseFloat((bps / 100).toFixed(1));
  };

  const currentDiscount = userProfile.aprDiscount > 0
    ? userProfile.aprDiscount
    : calculateContinuousDiscount(stakedSkr, lockedSkr);

  // Tier progress bar calculations (continuous 1% to 25% from 100 to 10,000 SKR)
  let progressRatio = 0;
  let progressLabel = '';
  if (stakedSkr < 100) {
    progressRatio = Math.min(1, Math.max(0.04, stakedSkr / 100));
    progressLabel = `${(100 - stakedSkr).toLocaleString()} SKR to start earning discounts (1% @ 100 SKR)`;
  } else if (stakedSkr < 10000) {
    progressRatio = Math.min(1, Math.max(0.06, (stakedSkr - 100) / 9900));
    progressLabel = `${(10000 - stakedSkr).toLocaleString()} SKR to Max 25% discount · Currently ${currentDiscount.toFixed(1)}% OFF`;
  } else {
    progressRatio = 1;
    progressLabel = 'Max 25% APR Discount Active';
  }

  // Stake Modal Live Computations
  const parsedStakeAmount = parseFloat(stakeInput) || 0;
  const isStakeExceeding = parsedStakeAmount > walletSkr;
  const canConfirmStake = parsedStakeAmount > 0 && !isStakeExceeding;
  const projectedStakedTotal = stakedSkr + parsedStakeAmount;
  const projectedDiscount = calculateContinuousDiscount(projectedStakedTotal, lockedSkr);
  const projectedTier = projectedDiscount >= 25 ? 'VIP Tier' : projectedDiscount >= 1 ? 'Active Tier' : 'Standard';

  // Unstake Modal Live Computations
  const parsedUnstakeAmount = parseFloat(unstakeInput) || 0;
  const isUnstakeExceeding = parsedUnstakeAmount > availableToUnstake;
  const canConfirmUnstake = parsedUnstakeAmount > 0 && !isUnstakeExceeding;
  const remainingStaked = Math.max(0, stakedSkr - parsedUnstakeAmount);
  const remainingDiscount = calculateContinuousDiscount(remainingStaked, lockedSkr);
  const willDowngradeTier = parsedUnstakeAmount > 0 && remainingDiscount < currentDiscount;

  const handleOpenStake = (initialAmt?: number) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setStakeInput(initialAmt ? initialAmt.toString() : '');
    setShowStakeModal(true);
  };

  const handleOpenUnstake = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setUnstakeInput('');
    setShowUnstakeModal(true);
  };

  const handleConfirmStake = () => {
    if (!canConfirmStake) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    const amount = parsedStakeAmount;
    setShowStakeModal(false);
    setStakeInput('');
    onStakeSkr(amount);
  };

  const handleConfirmUnstake = () => {
    if (!canConfirmUnstake || !onUnstakeSkr) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    const amount = parsedUnstakeAmount;
    setShowUnstakeModal(false);
    setUnstakeInput('');
    onUnstakeSkr(amount);
  };

  if (subView === 'SETTINGS') {
    return (
      <SettingsView
        onBack={() => setSubView('PROFILE')}
        skrHandle={skrUsername}
        lockEnabled={lockEnabled}
        onToggleLock={handleToggleLock}
        onLockApp={onLockApp ?? (() => {})}
        onOpenLeaderboard={onOpenLeaderboard ?? (() => {})}
        onOpenJudgeBriefing={onOpenJudgeBriefing ?? (() => {})}
        onOpenAssetsModal={onOpenAssetsModal ?? (() => {})}
      />
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Top Header Row ── */}
      <View style={styles.topHeaderRow}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/logo.png')} style={styles.headerLogo} resizeMode="contain" />
          <Text style={[styles.screenTitle, { color: colors.text }]}>Profile</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            setSubView('SETTINGS');
          }}
          style={[styles.settingsBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* ── 1. Profile Hero Card ── */}
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.skrUserRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.skrUsernameText, { color: colors.text }]}>{skrUsername}</Text>
            <Text style={[styles.skrHandleSub, { color: colors.primaryLabel }]}>
              Solana Seeker Verified Profile
            </Text>
          </View>
          <View style={[styles.skrBadge, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
            <Text style={[styles.skrBadgeText, { color: colors.primaryLabel }]}>.SKR DOMAIN</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.divider }]} />

        <View style={styles.heroQuickInfo}>
          <View style={styles.heroQuickItem}>
            <Text style={[styles.heroQuickLabel, { color: colors.textMuted }]}>Tier Status</Text>
            <Text style={[styles.heroQuickValue, { color: colors.text }]}>
              {currentDiscount >= 25 ? 'VIP (25% MAX OFF)' : currentDiscount >= 1 ? `Active (${currentDiscount.toFixed(1)}% OFF)` : 'Standard (0% OFF)'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── 2. SKR Staking Hub Card ── */}
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.creditHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <Text style={[styles.cardHeading, { color: colors.text }]}>SKR Staking</Text>
          </View>
          <View style={[styles.tierTag, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
            <Text style={[styles.tierTagText, { color: colors.primaryLabel }]}>
              {currentDiscount >= 25 ? '25% MAX OFF' : currentDiscount >= 1 ? `${currentDiscount.toFixed(1)}% APR OFF` : 'Standard Tier'}
            </Text>
          </View>
        </View>

        <Text style={[styles.bondExplainer, { color: colors.textSecondary }]}>
          Stake SKR to unlock continuous interest rate discounts from 1% up to 25% (at 10,000+ SKR) across all lending desks, and earn real USDC dividends from 50% of protocol origination fees.
        </Text>

        {/* Primary Staking Balances Grid */}
        <View style={styles.bondStatsRow}>
          <View style={[styles.bondStatBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Text style={[styles.bondStatLabel, { color: colors.textMuted }]}>Staked Balance</Text>
            <Text style={[styles.bondStatValue, { color: colors.text }]}>
              {stakedSkr.toLocaleString()} SKR
            </Text>
            <Text style={[styles.bondStatSub, { color: colors.textMuted }]}>
              ≈ ${stakedUsd.toFixed(2)} USD
            </Text>
          </View>
          <View style={[styles.bondStatBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Text style={[styles.bondStatLabel, { color: colors.textMuted }]}>In Wallet</Text>
            <Text style={[styles.bondStatValue, { color: colors.primaryLabel }]}>
              {walletSkr.toLocaleString()} SKR
            </Text>
            <Text style={[styles.bondStatSub, { color: colors.textMuted }]}>
              Available to Stake
            </Text>
          </View>
        </View>

        {/* Breakdown if loan locked */}
        {lockedSkr > 0 && (
          <View style={[styles.lockWarningBanner, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Ionicons name="lock-closed" size={14} color={colors.warning} />
            <Text style={[styles.lockWarningText, { color: colors.textSecondary }]}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{lockedSkr.toLocaleString()} SKR</Text> is currently locked backing active loans. Unstake available: <Text style={{ fontWeight: '800', color: colors.text }}>{availableToUnstake.toLocaleString()} SKR</Text>.
            </Text>
          </View>
        )}

        {/* Tier Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressHeaderRow}>
            <Text style={[styles.progressTitle, { color: colors.textMuted }]}>DISCOUNT PROGRESS (10K SKR MAX)</Text>
            <Text style={[styles.progressBadgeText, { color: colors.primaryLabel }]}>
              {currentDiscount > 0 ? `${currentDiscount.toFixed(1)}% APR OFF` : '0% DISCOUNT'}
            </Text>
          </View>
          <View style={[styles.progressBarTrack, { backgroundColor: colors.cardAlt }]}>
            <View style={[styles.progressBarFill, { width: `${Math.round(progressRatio * 100)}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={[styles.progressSubText, { color: colors.textSecondary }]}>{progressLabel}</Text>
        </View>

        {/* Benefits Badges */}
        <View style={styles.benefitsRow}>
          <View style={[styles.benefitPill, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Ionicons name="flash-outline" size={13} color={colors.primary} />
            <Text style={[styles.benefitPillText, { color: colors.text }]}>1% OFF @ 100 SKR</Text>
          </View>
          <View style={[styles.benefitPill, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Ionicons name="diamond-outline" size={13} color={colors.primary} />
            <Text style={[styles.benefitPillText, { color: colors.text }]}>25% MAX OFF @ 10k SKR</Text>
          </View>
          <View style={[styles.benefitPill, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Ionicons name="cash-outline" size={13} color={colors.success} />
            <Text style={[styles.benefitPillText, { color: colors.text }]}>USDC Yield Vault</Text>
          </View>
        </View>

        {/* Action Buttons: Stake & Unstake */}
        <View style={styles.stakingActionsRow}>
          <TouchableOpacity
            style={[styles.primaryStakeBtn, { backgroundColor: colors.primary }]}
            onPress={() => handleOpenStake()}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
            <Text style={styles.primaryStakeBtnText}>Stake SKR</Text>
          </TouchableOpacity>

          {availableToUnstake > 0 && onUnstakeSkr && (
            <TouchableOpacity
              style={[styles.secondaryUnstakeBtn, { borderColor: colors.cardBorder, backgroundColor: colors.cardAlt }]}
              onPress={handleOpenUnstake}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-undo-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.secondaryUnstakeBtnText, { color: colors.textSecondary }]}>Unstake</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Presets Section */}
        <View style={styles.presetSection}>
          <Text style={[styles.presetSectionLabel, { color: colors.textMuted }]}>1-TAP PRESET STAKES</Text>
          <View style={styles.presetRow}>
            <TouchableOpacity
              style={[styles.presetBtn, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
              onPress={() => handleOpenStake(500)}
              activeOpacity={0.7}
            >
              <Text style={[styles.presetBtnText, { color: colors.primaryLabel }]}>+500 SKR</Text>
              <Text style={[styles.presetBtnSub, { color: colors.textMuted }]}>~2.0% off</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetBtn, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
              onPress={() => handleOpenStake(5000)}
              activeOpacity={0.7}
            >
              <Text style={[styles.presetBtnText, { color: colors.primaryLabel }]}>+5,000 SKR</Text>
              <Text style={[styles.presetBtnSub, { color: colors.textMuted }]}>~13.0% off</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetBtn, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
              onPress={() => handleOpenStake(10000)}
              activeOpacity={0.7}
            >
              <Text style={[styles.presetBtnText, { color: colors.primaryLabel }]}>+10,000 SKR</Text>
              <Text style={[styles.presetBtnSub, { color: colors.textMuted }]}>25% MAX off</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── 3. Staking Yield Rewards Card ── */}
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.creditHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="gift-outline" size={18} color={colors.success} />
            <Text style={[styles.cardHeading, { color: colors.text }]}>Protocol Yield Dividends</Text>
          </View>
          <View style={[styles.tierTag, { backgroundColor: accruedUsd > 0 ? 'rgba(16, 185, 129, 0.12)' : colors.cardAlt, borderColor: accruedUsd > 0 ? colors.success : colors.cardBorder }]}>
            <Text style={[styles.tierTagText, { color: accruedUsd > 0 ? colors.success : colors.textMuted }]}>
              {accruedUsd > 0 ? 'REWARDS READY' : 'DIVIDENDS ACTIVE'}
            </Text>
          </View>
        </View>

        <Text style={[styles.yieldExplainer, { color: colors.textSecondary }]}>
          ClockLend distributes 50% of borrow origination fees on-chain to staked SKR holders. Dividends accrue directly in real USDC.
        </Text>

        <View style={styles.yieldStatsGrid}>
          <View style={[styles.yieldStatItem, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Accrued Yield</Text>
            <Text style={[styles.yieldAmountText, { color: colors.text }]}>${accruedUsd.toFixed(4)} USDC</Text>
          </View>
          <View style={[styles.yieldStatItem, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Lifetime Claimed</Text>
            <Text style={[styles.yieldAmountText, { color: colors.textSecondary }]}>${totalClaimedUsd.toFixed(4)} USDC</Text>
          </View>
        </View>

        {canClaimYield ? (
          <TouchableOpacity
            style={[styles.claimYieldFullBtn, { backgroundColor: colors.success }]}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
              onClaimYield();
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
            <Text style={styles.claimYieldFullBtnText}>Claim ${accruedUsd.toFixed(4)} USDC</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.cooldownNotice, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.cooldownText, { color: colors.textMuted }]}>
              Yield accumulates automatically from borrowers. Claims are subject to a 1-hour anti-flash-loan cooldown.
            </Text>
          </View>
        )}
      </View>

      {/* ── 4. Wallet Information Card ── */}
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[styles.cardHeading, { color: colors.text }]}>Wallet Information</Text>

        <View style={styles.dataField}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>ClockLend Tag</Text>
          <View style={styles.fieldValueRow}>
            <Text style={[styles.fieldValueText, { color: colors.text }]}>{skrUsername}</Text>
            <TouchableOpacity
              style={[styles.copyBtn, { backgroundColor: colors.cardAlt }]}
              onPress={() => copyToClipboard(skrUsername, 'Tag')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={copiedKey === 'Tag' ? 'checkmark' : 'copy-outline'}
                size={16}
                color={copiedKey === 'Tag' ? colors.success : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.divider }]} />

        <View style={styles.dataField}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Wallet Address</Text>
          <View style={styles.fieldValueRow}>
            <Text style={[styles.addressFullText, { color: colors.text }]}>
              {shorten(userProfile.pubkey)}
            </Text>
            <TouchableOpacity
              style={[styles.copyBtn, { backgroundColor: colors.cardAlt }]}
              onPress={() => copyToClipboard(userProfile.pubkey, 'Address')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={copiedKey === 'Address' ? 'checkmark' : 'copy-outline'}
                size={16}
                color={copiedKey === 'Address' ? colors.success : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.divider }]} />

        <View style={styles.poweredByRow}>
          <Text style={[styles.poweredByText, { color: colors.textMuted }]}>Powered By</Text>
          <View style={[styles.solanaPill, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Image
              source={require('../../assets/tokens/sol.png')}
              style={styles.solanaLogo}
              resizeMode="contain"
            />
            <Text style={[styles.solanaPillText, { color: colors.text }]}>SOLANA MAINNET</Text>
          </View>
        </View>
      </View>

      {/* ── 5. Disconnect Wallet Button ── */}
      <TouchableOpacity
        style={[styles.disconnectBtn, { borderColor: colors.danger, backgroundColor: colors.card }]}
        onPress={() => {
          Alert.alert(
            'Disconnect Wallet',
            'Are you sure you want to disconnect your Seeker Seed Vault session?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Disconnect', style: 'destructive', onPress: onDisconnectWallet },
            ]
          );
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={[styles.disconnectBtnText, { color: colors.danger }]}>Disconnect Wallet</Text>
      </TouchableOpacity>

      {/* ══════════════════════════════════════════════════════ */}
      {/* ── MODAL: STAKE SKR ───────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════ */}
      <Modal
        visible={showStakeModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowStakeModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalDismissArea}
            activeOpacity={1}
            onPress={() => setShowStakeModal(false)}
          />

          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="sparkles" size={20} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Stake SKR</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowStakeModal(false)}
                style={[styles.modalCloseBtn, { backgroundColor: colors.cardAlt }]}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBalanceRow}>
              <Text style={[styles.modalBalanceLabel, { color: colors.textMuted }]}>Wallet Balance:</Text>
              <Text style={[styles.modalBalanceValue, { color: colors.text }]}>
                {walletSkr.toLocaleString()} SKR
              </Text>
            </View>

            {/* Input Box */}
            <View style={[styles.inputBox, { backgroundColor: colors.cardAlt, borderColor: isStakeExceeding ? colors.danger : colors.cardBorder }]}>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={stakeInput}
                  onChangeText={(val) => setStakeInput(sanitizeDecimal(val))}
                  autoFocus={true}
                />
                <Text style={[styles.inputTokenLabel, { color: colors.primaryLabel }]}>SKR</Text>
                <TouchableOpacity
                  style={[styles.maxBtn, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                    setStakeInput(walletSkr > 0 ? walletSkr.toString() : '0');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.maxBtnText, { color: colors.primaryLabel }]}>MAX</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.inputUsdEstimate, { color: colors.textMuted }]}>
                ≈ ${(parsedStakeAmount * skrPrice).toFixed(2)} USD
              </Text>
            </View>

            {/* Preset increment chips */}
            <View style={styles.chipRow}>
              {[500, 1000, 5000].map((amt) => (
                <TouchableOpacity
                  key={amt}
                  style={[styles.presetChip, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                    const cur = parseFloat(stakeInput) || 0;
                    setStakeInput(Math.min(walletSkr, cur + amt).toString());
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.presetChipText, { color: colors.text }]}>+{amt.toLocaleString()}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.presetChip, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setStakeInput(walletSkr > 0 ? walletSkr.toString() : '0');
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.presetChipText, { color: colors.primaryLabel }]}>MAX</Text>
              </TouchableOpacity>
            </View>

            {/* Projected Tier Preview */}
            <View style={[styles.projectedCard, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
              <View style={styles.projectedRow}>
                <Text style={[styles.projectedLabel, { color: colors.textMuted }]}>Projected APR Discount</Text>
                <Text style={[styles.projectedVal, { color: colors.primaryLabel }]}>
                  {projectedDiscount.toFixed(1)}% APR OFF ({projectedTier})
                </Text>
              </View>
              <View style={styles.projectedRow}>
                <Text style={[styles.projectedLabel, { color: colors.textMuted }]}>New Total Stake</Text>
                <Text style={[styles.projectedVal, { color: colors.text }]}>
                  {projectedStakedTotal.toLocaleString()} SKR
                </Text>
              </View>
            </View>

            {/* Error Message */}
            {isStakeExceeding && (
              <View style={[styles.errorBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>
                  Amount exceeds your wallet balance ({walletSkr.toLocaleString()} SKR).
                </Text>
              </View>
            )}

            {/* Informational bullet note */}
            <Text style={[styles.modalNote, { color: colors.textMuted }]}>
              • Staked SKR automatically qualifies for 50% protocol loan fee dividends.{'\n'}
              • You can unstake anytime when not locked in active loans.
            </Text>

            {/* Confirm Stake Button */}
            <TouchableOpacity
              style={[
                styles.modalSubmitBtn,
                { backgroundColor: canConfirmStake ? colors.primary : colors.cardAlt },
              ]}
              onPress={handleConfirmStake}
              disabled={!canConfirmStake}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.modalSubmitBtnText,
                  { color: canConfirmStake ? '#FFFFFF' : colors.textMuted },
                ]}
              >
                {isStakeExceeding
                  ? 'Insufficient SKR Balance'
                  : parsedStakeAmount > 0
                  ? `Stake ${parsedStakeAmount.toLocaleString()} SKR`
                  : 'Enter Stake Amount'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══════════════════════════════════════════════════════ */}
      {/* ── MODAL: UNSTAKE SKR ─────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════ */}
      <Modal
        visible={showUnstakeModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowUnstakeModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalDismissArea}
            activeOpacity={1}
            onPress={() => setShowUnstakeModal(false)}
          />

          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="arrow-undo-circle" size={20} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Unstake SKR</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowUnstakeModal(false)}
                style={[styles.modalCloseBtn, { backgroundColor: colors.cardAlt }]}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Balances summary */}
            <View style={[styles.projectedCard, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
              <View style={styles.projectedRow}>
                <Text style={[styles.projectedLabel, { color: colors.textMuted }]}>Total Staked</Text>
                <Text style={[styles.projectedVal, { color: colors.text }]}>{stakedSkr.toLocaleString()} SKR</Text>
              </View>
              <View style={styles.projectedRow}>
                <Text style={[styles.projectedLabel, { color: colors.textMuted }]}>Available to Unstake</Text>
                <Text style={[styles.projectedVal, { color: colors.success }]}>{availableToUnstake.toLocaleString()} SKR</Text>
              </View>
              {lockedSkr > 0 && (
                <View style={styles.projectedRow}>
                  <Text style={[styles.projectedLabel, { color: colors.warning }]}>Locked in Loans</Text>
                  <Text style={[styles.projectedVal, { color: colors.warning }]}>{lockedSkr.toLocaleString()} SKR</Text>
                </View>
              )}
            </View>

            {/* Input Box */}
            <View style={[styles.inputBox, { backgroundColor: colors.cardAlt, borderColor: isUnstakeExceeding ? colors.danger : colors.cardBorder }]}>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={unstakeInput}
                  onChangeText={(val) => setUnstakeInput(sanitizeDecimal(val))}
                  autoFocus={true}
                />
                <Text style={[styles.inputTokenLabel, { color: colors.primaryLabel }]}>SKR</Text>
                <TouchableOpacity
                  style={[styles.maxBtn, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                    setUnstakeInput(availableToUnstake > 0 ? availableToUnstake.toString() : '0');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.maxBtnText, { color: colors.primaryLabel }]}>MAX</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.inputUsdEstimate, { color: colors.textMuted }]}>
                ≈ ${(parsedUnstakeAmount * skrPrice).toFixed(2)} USD
              </Text>
            </View>

            {/* Percentage Chips */}
            <View style={styles.chipRow}>
              {[0.25, 0.5, 0.75].map((pct) => (
                <TouchableOpacity
                  key={pct}
                  style={[styles.presetChip, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                    const amt = Math.floor(availableToUnstake * pct);
                    setUnstakeInput(amt.toString());
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.presetChipText, { color: colors.text }]}>{pct * 100}%</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.presetChip, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setUnstakeInput(availableToUnstake > 0 ? availableToUnstake.toString() : '0');
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.presetChipText, { color: colors.primaryLabel }]}>MAX</Text>
              </TouchableOpacity>
            </View>

            {/* Input Selection Details */}
            {parsedUnstakeAmount > 0 && !isUnstakeExceeding && (
              <View style={[styles.projectedCard, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
                <View style={styles.projectedRow}>
                  <Text style={[styles.projectedLabel, { color: colors.textMuted }]}>Unstaking Amount</Text>
                  <Text style={[styles.projectedVal, { color: colors.primaryLabel }]}>
                    {parsedUnstakeAmount.toLocaleString()} SKR ({availableToUnstake > 0 ? Math.min(100, Math.round((parsedUnstakeAmount / availableToUnstake) * 100)) : 0}%)
                  </Text>
                </View>
                <View style={styles.projectedRow}>
                  <Text style={[styles.projectedLabel, { color: colors.textMuted }]}>Remaining Stake</Text>
                  <Text style={[styles.projectedVal, { color: colors.text }]}>
                    {remainingStaked.toLocaleString()} SKR
                  </Text>
                </View>
                <View style={styles.projectedRow}>
                  <Text style={[styles.projectedLabel, { color: colors.textMuted }]}>New APR Discount</Text>
                  <Text style={[styles.projectedVal, { color: remainingDiscount > 0 ? colors.primaryLabel : colors.textSecondary }]}>
                    {remainingDiscount.toFixed(1)}% OFF {willDowngradeTier ? `(was ${currentDiscount.toFixed(1)}%)` : ''}
                  </Text>
                </View>
              </View>
            )}

            {/* Downgrade Alert */}
            {willDowngradeTier && (
              <View style={[styles.errorBox, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                <Ionicons name="warning" size={16} color={colors.warning} />
                <Text style={[styles.errorText, { color: colors.warning }]}>
                  Unstaking will lower your APR discount from {currentDiscount.toFixed(1)}% to {remainingDiscount.toFixed(1)}%.
                </Text>
              </View>
            )}

            {/* Error Message */}
            {isUnstakeExceeding && (
              <View style={[styles.errorBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>
                  Amount exceeds available unstake balance ({availableToUnstake.toLocaleString()} SKR).
                </Text>
              </View>
            )}

            {/* Confirm Unstake Button */}
            <TouchableOpacity
              style={[
                styles.modalSubmitBtn,
                { backgroundColor: canConfirmUnstake ? colors.primary : colors.cardAlt },
              ]}
              onPress={handleConfirmUnstake}
              disabled={!canConfirmUnstake}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.modalSubmitBtnText,
                  { color: canConfirmUnstake ? '#FFFFFF' : colors.textMuted },
                ]}
              >
                {isUnstakeExceeding
                  ? 'Exceeds Available Balance'
                  : parsedUnstakeAmount > 0
                  ? `Unstake ${parsedUnstakeAmount.toLocaleString()} SKR`
                  : 'Enter Unstake Amount'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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
    paddingBottom: 48,
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
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  skrUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  skrUsernameText: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  skrHandleSub: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  skrBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  skrBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroQuickInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  heroQuickItem: {
    flex: 1,
  },
  heroQuickLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  heroQuickValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  infoCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeading: {
    fontSize: 16,
    fontWeight: '800',
  },
  creditHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  tierTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  tierTagText: {
    fontSize: 11,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 3,
  },
  bondExplainer: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    marginBottom: 14,
  },
  bondStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  bondStatBox: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  bondStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  bondStatValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  bondStatSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  lockWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  lockWarningText: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  progressContainer: {
    marginBottom: 14,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  progressBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  progressBarTrack: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressSubText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  benefitsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  benefitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  benefitPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stakingActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  primaryStakeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryStakeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryUnstakeBtn: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  secondaryUnstakeBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  presetSection: {
    marginBottom: 4,
  },
  presetSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 10,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  presetBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  presetBtnSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  yieldExplainer: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 12,
  },
  yieldStatsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  yieldStatItem: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  yieldAmountText: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  claimYieldFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
  },
  claimYieldFullBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  cooldownNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  cooldownText: {
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  dataField: {
    paddingVertical: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  fieldValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldValueText: {
    fontSize: 15,
    fontWeight: '700',
  },
  addressFullText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  copyBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  poweredByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  poweredByText: {
    fontSize: 12,
    fontWeight: '600',
  },
  solanaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  solanaLogo: {
    width: 14,
    height: 14,
  },
  solanaPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    marginTop: 6,
  },
  disconnectBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: 22,
    paddingBottom: 36,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalBalanceLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalBalanceValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  inputBox: {
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '900',
    padding: 0,
  },
  inputTokenLabel: {
    fontSize: 16,
    fontWeight: '800',
    marginRight: 10,
  },
  maxBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  maxBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  inputUsdEstimate: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  projectedCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  projectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  projectedLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  projectedVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  modalNote: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 16,
  },
  modalSubmitBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
