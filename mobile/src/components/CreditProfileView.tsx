import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { UserProfile, WalletAssets } from '../types';
import { SkrYieldVaultState, UserYieldPositionState } from '../solana/onChainService';
import {
  isLockEnabled,
  setLockEnabled,
  getUserPin,
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
  onSetupPin?: () => void;
  onChangePin?: () => void;
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
  onSetupPin,
  onChangePin,
  onOpenLeaderboard,
  onOpenJudgeBriefing,
  yieldVault,
  yieldPosition,
  onClaimYield,
}) => {
  const { colors, mode } = useTheme();
  const [subView, setSubView] = useState<'PROFILE' | 'SETTINGS'>('PROFILE');
  const [lockEnabled, setLockEnabledState] = useState<boolean>(false);
  const [hasCustomPin, setHasCustomPin] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    loadSecurityPrefs();
  }, []);

  const loadSecurityPrefs = async () => {
    const l = await isLockEnabled();
    const p = await getUserPin();
    setLockEnabledState(l);
    setHasCustomPin(!!p);
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

  const accruedUsd = (yieldPosition?.accruedRewards ?? 0) / 1_000_000;
  const canClaimYield = !!onClaimYield && accruedUsd > 0;
  const cleanHandle = skrHandle.replace(/^@/, '').replace(/\.skr$/i, '');
  const skrUsername = `${cleanHandle}.skr`;

  if (subView === 'SETTINGS') {
    return (
      <SettingsView
        onBack={() => setSubView('PROFILE')}
        skrHandle={skrUsername}
        hasCustomPin={hasCustomPin}
        lockEnabled={lockEnabled}
        onToggleLock={handleToggleLock}
        onSetupPin={onSetupPin ?? (() => {})}
        onChangePin={onChangePin ?? (() => {})}
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
              {userProfile.tier === 'Tier 2' ? 'Tier 2 (50% OFF)' : userProfile.tier === 'Tier 1' ? 'Tier 1 (25% OFF)' : 'Standard'}
            </Text>
          </View>
          <View style={styles.heroQuickItem}>
            <Text style={[styles.heroQuickLabel, { color: colors.textMuted }]}>Score</Text>
            <Text style={[styles.heroQuickValue, { color: colors.primaryLabel }]}>
              {(userProfile.reputationScore / 100).toFixed(0)} pts
            </Text>
          </View>
        </View>
      </View>

      {/* ── 2. Staking Yield Rewards (If Position Exists) ── */}
      {yieldPosition && accruedUsd > 0 && (
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.creditHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="sparkles" size={18} color={colors.success} />
              <Text style={[styles.cardHeading, { color: colors.text }]}>Staking Yield</Text>
            </View>
            <View style={[styles.tierTag, { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: colors.success }]}>
              <Text style={[styles.tierTagText, { color: colors.success }]}>REWARDS READY</Text>
            </View>
          </View>
          <View style={styles.yieldRow}>
            <View>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Accrued Protocol Yield</Text>
              <Text style={[styles.yieldAmountText, { color: colors.text }]}>${accruedUsd.toFixed(4)} USDC</Text>
            </View>
            {canClaimYield && (
              <TouchableOpacity
                style={[styles.claimYieldBtn, { backgroundColor: colors.success }]}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                  onClaimYield();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.claimYieldText}>Claim Yield</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ── 5. Wallet Information Card ── */}
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

      {/* ── 6. Disconnect Wallet Button ── */}
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
  standingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  standingItem: {
    width: '47%',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 3,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
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
    marginBottom: 14,
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
  presetSection: {
    marginBottom: 10,
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
  unstakeBtn: {
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 6,
  },
  unstakeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  yieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  yieldAmountText: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
  },
  claimYieldBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  claimYieldText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
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
});
