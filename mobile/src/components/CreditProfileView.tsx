import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Share,
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
import { SettingsModal } from './SettingsModal';

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
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
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

  const handleShareReferral = async (referralCode: string) => {
    try {
      Haptics.selectionAsync();
      await Share.share({
        message: `Join ClockLend P2P Credit Protocol on Solana Seeker using my referral code: ${referralCode}! https://clocklend.xyz`,
      });
    } catch {}
  };

  const shorten = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-8)}`;

  const accruedUsd = (yieldPosition?.accruedRewards ?? 0) / 1_000_000;
  const canClaimYield = !!onClaimYield && accruedUsd > 0;
  const referralCode = userProfile.pubkey.slice(0, 8).toUpperCase();
  const initials = (skrHandle.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) || 'CL').toUpperCase();

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
            setShowSettingsModal(true);
          }}
          style={[styles.settingsBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* ── 1. Profile Hero Card (Matches 703a904b) ── */}
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.profileHeaderRow}>
          <View style={[styles.avatarHex, { backgroundColor: colors.badgeBg, borderColor: colors.primary }]}>
            <Text style={[styles.avatarInitials, { color: colors.primaryLabel }]}>{initials}</Text>
            <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="camera" size={10} color="#FFFFFF" />
            </View>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.text }]}>
              {skrHandle.startsWith('@') ? skrHandle.slice(1) : skrHandle}
            </Text>
            <Text style={[styles.profileHandle, { color: colors.primaryLabel }]}>
              @{skrHandle.startsWith('@') ? skrHandle.slice(1) : skrHandle}
            </Text>
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
            <Text style={[styles.fieldValueText, { color: colors.text }]}>@{skrHandle}</Text>
            <TouchableOpacity
              style={[styles.copyBtn, { backgroundColor: colors.cardAlt }]}
              onPress={() => copyToClipboard(`@${skrHandle}`, 'Tag')}
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

        {/* Powered By Solana Badge */}
        <View style={styles.poweredByRow}>
          <Text style={[styles.poweredByText, { color: colors.textMuted }]}>Powered By</Text>
          <View style={[styles.solanaPill, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Ionicons name="hardware-chip" size={13} color={colors.primary} />
            <Text style={[styles.solanaPillText, { color: colors.text }]}>SOLANA</Text>
          </View>
        </View>
      </View>

      {/* ── 3. Referral Code Card (Matches 703a904b) ── */}
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[styles.cardHeading, { color: colors.text }]}>Referral Code</Text>

        <View style={styles.dataField}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Your Referral Code</Text>
          <View style={styles.fieldValueRow}>
            <Text style={[styles.referralCodeText, { color: colors.text }]}>{referralCode}</Text>
            <TouchableOpacity
              style={[styles.copyBtn, { backgroundColor: colors.cardAlt }]}
              onPress={() => copyToClipboard(referralCode, 'Referral Code')}
              activeOpacity={0.7}
            >
              <Ionicons
                name={copiedKey === 'Referral Code' ? 'checkmark' : 'copy-outline'}
                size={16}
                color={copiedKey === 'Referral Code' ? colors.success : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.inviteLinkRow}
          onPress={() => handleShareReferral(referralCode)}
          activeOpacity={0.7}
        >
          <Text style={[styles.inviteLinkText, { color: colors.primaryLabel }]}>
            Invite Friends and earn rewards
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primaryLabel} />
        </TouchableOpacity>
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

      {/* ── Dedicated Settings Modal (Matches 6d27c768) ── */}
      <SettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        skrHandle={skrHandle}
        hasCustomPin={hasCustomPin}
        lockEnabled={lockEnabled}
        onToggleLock={handleToggleLock}
        onSetupPin={() => {
          setShowSettingsModal(false);
          if (onSetupPin) onSetupPin();
        }}
        onChangePin={() => {
          setShowSettingsModal(false);
          if (onChangePin) onChangePin();
        }}
        onLockApp={() => {
          setShowSettingsModal(false);
          if (onLockApp) onLockApp();
        }}
        onOpenLeaderboard={() => {
          setShowSettingsModal(false);
          if (onOpenLeaderboard) onOpenLeaderboard();
        }}
        onOpenJudgeBriefing={() => {
          setShowSettingsModal(false);
          if (onOpenJudgeBriefing) onOpenJudgeBriefing();
        }}
        onOpenAssetsModal={() => {
          setShowSettingsModal(false);
          if (onOpenAssetsModal) onOpenAssetsModal();
        }}
      />
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
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarHex: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: '900',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  profileHandle: {
    fontSize: 14,
    fontWeight: '600',
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
  referralCodeText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
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
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  solanaPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  inviteLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  inviteLinkText: {
    fontSize: 13,
    fontWeight: '700',
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
