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
  useWindowDimensions,
  Linking,
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
import { CommunityQuestsCard } from './CommunityQuestsCard';

interface CreditProfileViewProps {
  userProfile: UserProfile;
  skrHandle: string;
  walletAssets?: WalletAssets;
  onStakeSkr?: (amount: number) => void;
  onUnstakeSkr?: (amount: number) => void;
  onOpenAssetsModal?: () => void;
  onDisconnectWallet: () => void;
  onLockApp?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenJudgeBriefing?: () => void;
  yieldVault?: SkrYieldVaultState;
  yieldPosition?: UserYieldPositionState;
  onClaimYield?: () => void;
  onQuestClaimed?: (pointsAdded: number) => void;
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
  onQuestClaimed,
}) => {
  const { colors, mode } = useTheme();
  // Small phones (360-400dp): tighten paddings and title sizes so nothing
  // gets clipped inside the profile cards and stake modals.
  const { width } = useWindowDimensions();
  const isCompact = width < 400;
  const [subView, setSubView] = useState<'PROFILE' | 'SETTINGS'>('PROFILE');
  const [lockEnabled, setLockEnabledState] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [showDisconnectModal, setShowDisconnectModal] = useState<boolean>(false);

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
  const availableToRelease = Math.max(0, stakedSkr - lockedSkr);
  const skrPrice = livePrices.skr || 0.024;
  const walletSkrUsd = walletSkr * skrPrice;
  const accruedUsd = (yieldPosition?.accruedRewards ?? 0) / 1_000_000;
  const totalClaimedUsd = (yieldPosition?.totalClaimed ?? 0) / 1_000_000;
  const canClaimYield = !!onClaimYield && accruedUsd > 0;
  const cleanHandle = skrHandle.replace(/^@/, '').replace(/\.skr$/i, '');
  const skrUsername = `${cleanHandle}.skr`;

  const calculateContinuousDiscount = (skrBalance: number, locked: number = 0): number => {
    const available = Math.max(0, skrBalance - locked);
    if (available < 100) return 0;
    if (available >= 10000) return 25;
    const bps = 100 + ((available - 100) * 2400) / 9900;
    return parseFloat((bps / 100).toFixed(1));
  };

  // Qualifying SKR balance: wallet holdings plus any existing protocol-bonded SKR
  const qualifyingSkr = Math.max(walletSkr, stakedSkr);
  const currentDiscount = userProfile.aprDiscount > 0
    ? userProfile.aprDiscount
    : calculateContinuousDiscount(qualifyingSkr, lockedSkr);

  // Tier progress bar calculations (continuous 1% to 25% from 100 to 10,000 SKR)
  let progressRatio = 0;
  let progressLabel = '';
  if (qualifyingSkr < 100) {
    progressRatio = Math.min(1, Math.max(0.04, qualifyingSkr / 100));
    progressLabel = `${(100 - qualifyingSkr).toLocaleString()} SKR in wallet to start earning discounts (1% @ 100 SKR)`;
  } else if (qualifyingSkr < 10000) {
    progressRatio = Math.min(1, Math.max(0.06, (qualifyingSkr - 100) / 9900));
    progressLabel = `${(10000 - qualifyingSkr).toLocaleString()} SKR to Max 25% discount · Currently ${currentDiscount.toFixed(1)}% OFF`;
  } else {
    progressRatio = 1;
    progressLabel = 'Max 25% APR Discount Active';
  }

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
          <Text
            style={[styles.screenTitle, { color: colors.text }, isCompact && styles.screenTitleCompact]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            Profile
          </Text>
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
            <Text
              style={[styles.skrUsernameText, { color: colors.text }, isCompact && styles.skrUsernameTextCompact]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {skrUsername}
            </Text>
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
            <Text
              style={[styles.heroQuickValue, { color: colors.text }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {currentDiscount >= 25 ? 'VIP (25% MAX OFF)' : currentDiscount >= 1 ? `Active (${currentDiscount.toFixed(1)}% OFF)` : 'Standard (0% OFF)'}
            </Text>
          </View>
          <View style={styles.heroQuickItem}>
            <Text style={[styles.heroQuickLabel, { color: colors.textMuted }]}>Reputation Score</Text>
            <Text
              style={[styles.heroQuickValue, { color: colors.primary }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {userProfile.reputationScore > 0 ? `${(userProfile.reputationScore / 100).toFixed(0)} pts` : '0 pts'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Moonwalk Community Quests (Social / X Follow) ── */}
      <CommunityQuestsCard
        userPubkey={userProfile?.pubkey || ''}
        onQuestClaimed={onQuestClaimed}
      />

      {/* ── 2. SKR Credit Tier & Discounts Card ── */}
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.creditHeaderRow}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <Text
              style={[styles.cardHeading, { color: colors.text }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              SKR Credit Tier & Discounts
            </Text>
          </View>
          <View style={[styles.tierTag, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
            <Text style={[styles.tierTagText, { color: colors.primaryLabel }]}>
              {currentDiscount >= 25 ? '25% MAX OFF' : currentDiscount >= 1 ? `${currentDiscount.toFixed(1)}% APR OFF` : 'Standard Tier'}
            </Text>
          </View>
        </View>

        <Text style={[styles.bondExplainer, { color: colors.textSecondary }]}>
          Hold SKR in your wallet or stake via Seed Vault to unlock continuous interest rate discounts from 1% up to 25% (at 10,000+ SKR) across all lending desks.
        </Text>

        {/* Balance & Rate Discount Stats Grid */}
        <View style={styles.bondStatsRow}>
          <View style={[styles.bondStatBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Text style={[styles.bondStatLabel, { color: colors.textMuted }]}>In Wallet</Text>
            <Text
              style={[styles.bondStatValue, { color: colors.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {walletSkr.toLocaleString()} SKR
            </Text>
            <Text style={[styles.bondStatSub, { color: colors.textMuted }]}>
              ≈ ${walletSkrUsd.toFixed(2)} USD
            </Text>
          </View>
          <View style={[styles.bondStatBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Text style={[styles.bondStatLabel, { color: colors.textMuted }]}>Interest Discount</Text>
            <Text
              style={[styles.bondStatValue, { color: colors.primaryLabel }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {currentDiscount > 0 ? `${currentDiscount.toFixed(1)}% OFF` : '0% OFF'}
            </Text>
            <Text style={[styles.bondStatSub, { color: colors.textMuted }]}>
              {currentDiscount >= 25 ? 'VIP Tier' : currentDiscount >= 1 ? 'Active Tier' : 'Standard'}
            </Text>
          </View>
        </View>

        {/* Breakdown if loan locked */}
        {lockedSkr > 0 && (
          <View style={[styles.lockWarningBanner, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Ionicons name="lock-closed" size={14} color={colors.warning} />
            <Text style={[styles.lockWarningText, { color: colors.textSecondary }]}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{lockedSkr.toLocaleString()} SKR</Text> is currently locked backing active loans.
            </Text>
          </View>
        )}

        {/* Tier Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressHeaderRow}>
            <Text
              style={[styles.progressTitle, { color: colors.textMuted }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              DISCOUNT PROGRESS (10K SKR MAX)
            </Text>
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
            <Ionicons name="shield-checkmark-outline" size={13} color={colors.success} />
            <Text style={[styles.benefitPillText, { color: colors.text }]}>Non-Custodial</Text>
          </View>
        </View>

        {/* Official Solana Mobile Staking Callout (Directs user to Seed Vault / stake.solanamobile.com) */}
        <View style={[styles.officialStakingBanner, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
          <View style={styles.officialStakingTop}>
            <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
            <Text style={[styles.officialStakingTitle, { color: colors.text }]}>
              Official Solana Mobile Staking
            </Text>
          </View>
          <Text style={[styles.officialStakingDesc, { color: colors.textSecondary }]}>
            ClockLend does not run staking. Stake SKR in your Seed Vault Wallet or at stake.solanamobile.com. Your stake stays in your custody.
          </Text>
          <TouchableOpacity
            style={[styles.officialStakingLinkBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              Linking.openURL('https://stake.solanamobile.com');
            }}
            activeOpacity={0.8}
            accessibilityRole="link"
            accessibilityLabel="Open official Solana Mobile staking portal"
          >
            <Text style={styles.officialStakingLinkBtnText}>Open stake.solanamobile.com ↗</Text>
          </TouchableOpacity>
        </View>

        {/* If user has legacy bonded SKR from earlier program versions, allow release */}
        {availableToRelease > 0 && onUnstakeSkr && (
          <TouchableOpacity
            style={[styles.releaseLegacyBtn, { borderColor: colors.cardBorder, backgroundColor: colors.cardAlt }]}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
              onUnstakeSkr(availableToRelease);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-undo-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.releaseLegacyBtnText, { color: colors.textSecondary }]}>
              Release Escrowed Bond ({availableToRelease.toLocaleString()} SKR)
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 3. Staking Yield Rewards Card ── */}
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.creditHeaderRow}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="gift-outline" size={18} color={colors.success} />
            <Text
              style={[styles.cardHeading, { color: colors.text }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              Protocol Yield Dividends
            </Text>
          </View>
          <View style={[styles.tierTag, { backgroundColor: accruedUsd > 0 ? 'rgba(16, 185, 129, 0.12)' : colors.cardAlt, borderColor: accruedUsd > 0 ? colors.success : colors.cardBorder }]}>
            <Text style={[styles.tierTagText, { color: accruedUsd > 0 ? colors.success : colors.textMuted }]}>
              {accruedUsd > 0 ? 'REWARDS READY' : 'DIVIDENDS ACTIVE'}
            </Text>
          </View>
        </View>

        <Text style={[styles.yieldExplainer, { color: colors.textSecondary }]}>
          ClockLend distributes 50% of borrow origination fees on-chain to eligible community members. Dividends accrue directly in real USDC.
        </Text>

        <View style={styles.yieldStatsGrid}>
          <View style={[styles.yieldStatItem, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Accrued Yield</Text>
            <Text
              style={[styles.yieldAmountText, { color: colors.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              ${accruedUsd.toFixed(4)} USDC
            </Text>
          </View>
          <View style={[styles.yieldStatItem, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Lifetime Claimed</Text>
            <Text
              style={[styles.yieldAmountText, { color: colors.textSecondary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              ${totalClaimedUsd.toFixed(4)} USDC
            </Text>
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
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch {}
          setShowDisconnectModal(true);
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={[styles.disconnectBtnText, { color: colors.danger }]}>Disconnect Wallet</Text>
      </TouchableOpacity>

      {/* ── MODAL: DISCONNECT WALLET CONFIRMATION ── */}
      <Modal
        visible={showDisconnectModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDisconnectModal(false)}
      >
        <View style={styles.disconnectModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowDisconnectModal(false)}
          />
          <View
            style={[
              styles.disconnectModalCard,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <View style={[styles.disconnectIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
              <Ionicons name="log-out-outline" size={32} color={colors.danger} />
            </View>

            <Text style={[styles.disconnectModalTitle, { color: colors.text }]}>
              Disconnect Wallet?
            </Text>
            <Text style={[styles.disconnectModalDesc, { color: colors.textSecondary }]}>
              Are you sure you want to disconnect your Seeker Seed Vault session? You can reconnect anytime.
            </Text>

            <View style={styles.disconnectModalBtnRow}>
              <TouchableOpacity
                style={[styles.disconnectModalCancelBtn, { borderColor: colors.cardBorder, backgroundColor: colors.cardAlt }]}
                onPress={() => setShowDisconnectModal(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.disconnectModalCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.disconnectModalConfirmBtn, { backgroundColor: colors.danger }]}
                onPress={() => {
                  setShowDisconnectModal(false);
                  onDisconnectWallet();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.disconnectModalConfirmText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
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
    flexShrink: 1,
  },
  screenTitleCompact: {
    fontSize: 20,
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
  skrUsernameTextCompact: {
    fontSize: 18,
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
    flexShrink: 0,
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
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 1,
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
    flexShrink: 1,
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
    flexShrink: 0,
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
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
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
    flexShrink: 1,
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
  officialStakingBanner: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 8,
  },
  officialStakingTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  officialStakingTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  officialStakingDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  officialStakingLinkBtn: {
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  officialStakingLinkBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  releaseLegacyBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 6,
  },
  releaseLegacyBtnText: {
    fontSize: 12,
    fontWeight: '700',
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
    fontSize: 14,
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
  disconnectModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  disconnectModalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  disconnectIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  disconnectModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  disconnectModalDesc: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  disconnectModalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  disconnectModalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disconnectModalCancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
  disconnectModalConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disconnectModalConfirmText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
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
  modalSheetCompact: {
    padding: 16,
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
  textInputCompact: {
    fontSize: 20,
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
    flexShrink: 0,
  },
  projectedVal: {
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'right',
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
