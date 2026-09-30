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
import { SkrYieldVaultState, UserYieldPositionState, tierDiscountLabel } from '../solana/onChainService';
import {
  isLockEnabled,
  setLockEnabled,
  isBiometricsEnabled,
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
      {/* ── Top Header Row (Matches 703a904b) ── */}
      <View style={styles.topHeaderRow}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/logo.png')} style={styles.headerLogo} resizeMode="contain" />
          <Text style={[styles.screenTitle, { color: colors.text }]}>Profile</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

      {/* ── 1. Profile Hero Card (Only .skr username, no profile image per user request) ── */}
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.skrUserRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.skrUsernameText, { color: colors.text }]}>{skrUsername}</Text>
            <Text style={[styles.skrHandleSub, { color: colors.primaryLabel }]}>Solana Seeker Verified Account</Text>
          </View>
          <View style={[styles.skrBadge, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
            <Text style={[styles.skrBadgeText, { color: colors.primaryLabel }]}>.SKR DOMAIN</Text>
          </View>
        </View>
      </View>

      {/* ── 2. Wallet Information Card (Matches 703a904b) ── */}
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[styles.cardHeading, { color: colors.text }]}>Wallet information</Text>

        {/* ClockLend Tag */}
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

        {/* Wallet Address */}
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

        {/* Powered By Solana Badge (Genuine Solana Token Logo) */}
        <View style={styles.poweredByRow}>
          <Text style={[styles.poweredByText, { color: colors.textMuted }]}>Powered By</Text>
          <View style={[styles.solanaPill, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Image
              source={require('../../assets/tokens/sol.png')}
              style={styles.solanaLogo}
              resizeMode="contain"
            />
            <Text style={[styles.solanaPillText, { color: colors.text }]}>SOLANA</Text>
          </View>
        </View>
      </View>

      {/* ── 4. On-Chain Credit Standing ── */}
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.creditHeaderRow}>
          <Text style={[styles.cardHeading, { color: colors.text }]}>On-Chain Standing</Text>
          <View style={[styles.tierTag, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
            <Text style={[styles.tierTagText, { color: colors.primaryLabel }]}>
              {tierDiscountLabel(userProfile.tier)}
            </Text>
          </View>
        </View>

        <View style={styles.standingGrid}>
          <View style={styles.standingItem}>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Reputation Score</Text>
            <Text style={[styles.metricValue, { color: colors.primaryLabel }]}>
              {(userProfile.reputationScore / 100).toFixed(1)}%
            </Text>
          </View>
          <View style={styles.standingItem}>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Completed Loans</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>
              {userProfile.totalLoansCompleted} on-time
            </Text>
          </View>
        </View>
      </View>

      {/* ── 5. Disconnect Wallet Button (Matches 703a904b red action) ── */}
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
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 14,
  },
  skrUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skrUsernameText: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  skrHandleSub: {
    fontSize: 13,
    fontWeight: '600',
  },
  skrBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  skrBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  infoCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
  },
  cardHeading: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 14,
  },
  dataField: {
    marginBottom: 6,
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
    letterSpacing: 0.2,
  },
  copyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
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
    paddingTop: 4,
  },
  poweredByText: {
    fontSize: 13,
    fontWeight: '500',
  },
  solanaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  solanaLogo: {
    width: 16,
    height: 16,
  },
  solanaPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  creditHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tierTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  tierTagText: {
    fontSize: 11,
    fontWeight: '800',
  },
  standingGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  standingItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 8,
    marginTop: 4,
    marginBottom: 20,
  },
  disconnectBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
