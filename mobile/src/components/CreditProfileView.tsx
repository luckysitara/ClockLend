import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Switch,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { UserProfile, WalletAssets } from '../types';
import { SkrYieldVaultState, UserYieldPositionState, tierDiscountLabel } from '../solana/onChainService';
import { PROGRAM_ID } from '../solana/program';
import {
  isLockEnabled,
  setLockEnabled,
  isBiometricsEnabled,
  setBiometricsEnabled,
  checkBiometricHardware,
  getUserPin,
} from '../services/securityService';

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
  const [lockEnabled, setLockEnabledState] = useState<boolean>(false);
  const [bioEnabled, setBioEnabledState] = useState<boolean>(true);
  const [hasBioHardware, setHasBioHardware] = useState<boolean>(false);
  const [hasCustomPin, setHasCustomPin] = useState<boolean>(false);

  useEffect(() => {
    loadSecurityPrefs();
  }, []);

  const loadSecurityPrefs = async () => {
    const l = await isLockEnabled();
    const b = await isBiometricsEnabled();
    const p = await getUserPin();
    const { hasHardware, isEnrolled } = await checkBiometricHardware();
    setLockEnabledState(l);
    setBioEnabledState(b);
    setHasCustomPin(!!p);
    setHasBioHardware(hasHardware && isEnrolled);
  };

  const openExplorer = () => {
    Linking.openURL(`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}`);
  };

  const shorten = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  const accruedUsd = (yieldPosition?.accruedRewards ?? 0) / 1_000_000;
  const canClaimYield = !!onClaimYield && accruedUsd > 0;

  // Extract initials from skrHandle
  const initials = (skrHandle.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) || 'SK').toUpperCase();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Top Header Row with ClockLend Logo (Matches 703a904b) ── */}
      <View style={styles.topHeaderRow}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/logo.png')} style={styles.headerLogo} resizeMode="contain" />
          <Text style={[styles.screenTitle, { color: colors.text }]}>Profile</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (hasCustomPin) {
              if (onChangePin) onChangePin();
            } else {
              if (onSetupPin) onSetupPin();
            }
          }}
          style={[styles.settingsBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* ── 1. Profile Hero Card (Seeker / Nectar style) ── */}
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.profileHeaderRow}>
          <View style={[styles.avatarHex, { backgroundColor: colors.badgeBg, borderColor: colors.primary }]}>
            <Text style={[styles.avatarInitials, { color: colors.primaryLabel }]}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.text }]}>{skrHandle}</Text>
            <View style={styles.addressPill}>
              <Ionicons name="wallet-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.addressText, { color: colors.textSecondary }]}>
                {shorten(userProfile.pubkey)}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.badgesStrip, { borderTopColor: colors.cardBorder }]}>
          <View style={[styles.chainBadge, { backgroundColor: colors.cardAlt }]}>
            <View style={styles.statusDot} />
            <Text style={[styles.chainBadgeText, { color: colors.textSecondary }]}>SOLANA MAINNET</Text>
          </View>
          <View style={[styles.chainBadge, { backgroundColor: colors.cardAlt }]}>
            <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
            <Text style={[styles.chainBadgeText, { color: colors.primaryLabel }]}>SEED VAULT</Text>
          </View>
        </View>
      </View>

      {/* ── 2. On-Chain Credit Standing ── */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>On-Chain Credit</Text>
          <View style={[styles.tierTag, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
            <Text style={[styles.tierTagText, { color: colors.primaryLabel }]}>
              {tierDiscountLabel(userProfile.tier)}
            </Text>
          </View>
        </View>

        <View style={styles.scoreRow}>
          <View style={styles.scoreCol}>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Reputation Score</Text>
            <Text style={[styles.scoreBig, { color: colors.text }]}>
              {(userProfile.reputationScore / 100).toFixed(1)}%
            </Text>
          </View>
          <View style={styles.scoreColRight}>
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Loan History</Text>
            <Text style={[styles.historyVal, { color: colors.textSecondary }]}>
              {userProfile.totalLoansCompleted} on-time • {userProfile.totalLoansDefaulted} defaults
            </Text>
          </View>
        </View>

        {/* Progress bar to Tier 2 */}
        <View style={styles.progressContainer}>
          <View style={styles.progressLabelRow}>
            <Text style={[styles.progressSub, { color: colors.textMuted }]}>Tier 2 Progress (1,000 SKR)</Text>
            <Text style={[styles.progressVal, { color: colors.primaryLabel }]}>
              {userProfile.availableSkr.toLocaleString()} / 1,000
            </Text>
          </View>
          <View style={[styles.progressBarTrack, { backgroundColor: colors.cardAlt }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  backgroundColor: colors.primary,
                  width: `${Math.min(100, Math.max(3, (userProfile.availableSkr / 1000) * 100))}%`,
                },
              ]}
            />
          </View>
        </View>
      </View>

      {/* ── 3. SKR Staking & Yield ── */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>SKR Escrow Stake</Text>
            <Text style={[styles.cardSub, { color: colors.textMuted }]}>
              Earns loan APR discounts & protocol dividends
            </Text>
          </View>
          <View style={styles.tokenPill}>
            <Text style={[styles.tokenPillText, { color: colors.primaryLabel }]}>
              {userProfile.stakedSkr.toLocaleString()} SKR
            </Text>
          </View>
        </View>

        {/* Quick Stake Preset Buttons */}
        <View style={styles.presetGrid}>
          {[500, 1000, 2500, 5000].map((amt) => (
            <TouchableOpacity
              key={amt}
              style={[styles.presetBtn, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onStakeSkr(amt);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.presetBtnText, { color: colors.primaryLabel }]}>+{amt.toLocaleString()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Unstake Row */}
        {onUnstakeSkr && userProfile.availableSkr > 0 && (
          <TouchableOpacity
            style={[styles.unstakeBtn, { borderColor: colors.cardBorder }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onUnstakeSkr(userProfile.availableSkr);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.unstakeText}>
              Withdraw {userProfile.availableSkr.toLocaleString()} Available SKR
            </Text>
          </TouchableOpacity>
        )}

        {/* Protocol Fee Dividends */}
        {yieldVault?.initialized && (
          <View style={[styles.yieldBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Accrued USDC Dividends</Text>
              <Text style={[styles.yieldAmount, { color: colors.primaryLabel }]}>
                ${((yieldPosition?.accruedRewards ?? 0) / 1_000_000).toFixed(4)} USDC
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.claimBtn,
                { backgroundColor: colors.primary },
                !canClaimYield && { opacity: 0.5 },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                if (onClaimYield) onClaimYield();
              }}
              disabled={!canClaimYield}
              activeOpacity={0.8}
            >
              <Text style={[styles.claimBtnText, { color: colors.primaryText }]}>Claim</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── 4. Wallet Holdings Strip ── */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Wallet Assets</Text>
          {walletAssets && (
            <Text style={[styles.totalUsd, { color: colors.textSecondary }]}>
              ${walletAssets.totalUsdValue.toFixed(2)}
            </Text>
          )}
        </View>

        <View style={styles.assetList}>
          <View style={styles.assetItem}>
            <View style={styles.assetLeft}>
              <View style={[styles.assetIconWrapper, { backgroundColor: '#14F19520' }]}>
                <Text style={styles.assetIconText}>◎</Text>
              </View>
              <View>
                <Text style={[styles.assetSymbol, { color: colors.text }]}>SOL</Text>
                <Text style={[styles.assetName, { color: colors.textMuted }]}>Solana</Text>
              </View>
            </View>
            <Text style={[styles.assetBalance, { color: colors.text }]}>
              {(walletAssets?.solBalance || 0).toFixed(3)}
            </Text>
          </View>

          <View style={[styles.itemDivider, { backgroundColor: colors.divider }]} />

          <View style={styles.assetItem}>
            <View style={styles.assetLeft}>
              <View style={[styles.assetIconWrapper, { backgroundColor: '#2775CA20' }]}>
                <Text style={[styles.assetIconText, { color: '#2775CA' }]}>$</Text>
              </View>
              <View>
                <Text style={[styles.assetSymbol, { color: colors.text }]}>USDC</Text>
                <Text style={[styles.assetName, { color: colors.textMuted }]}>USD Coin</Text>
              </View>
            </View>
            <Text style={[styles.assetBalance, { color: colors.text }]}>
              ${(walletAssets?.usdcBalance || 0).toFixed(2)}
            </Text>
          </View>

          <View style={[styles.itemDivider, { backgroundColor: colors.divider }]} />

          <View style={styles.assetItem}>
            <View style={styles.assetLeft}>
              <View style={[styles.assetIconWrapper, { backgroundColor: '#F59E0B20' }]}>
                <Text style={[styles.assetIconText, { color: '#F59E0B' }]}>⚡</Text>
              </View>
              <View>
                <Text style={[styles.assetSymbol, { color: colors.text }]}>SKR</Text>
                <Text style={[styles.assetName, { color: colors.textMuted }]}>Seeker Token</Text>
              </View>
            </View>
            <Text style={[styles.assetBalance, { color: colors.text }]}>
              {(walletAssets?.skrBalance || 0).toFixed(0)}
            </Text>
          </View>
        </View>

        {onOpenAssetsModal && (
          <TouchableOpacity
            style={[styles.manageAssetsBtn, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
            onPress={onOpenAssetsModal}
            activeOpacity={0.7}
          >
            <Text style={[styles.manageAssetsText, { color: colors.primaryLabel }]}>
              View & Manage Wallet Assets →
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 5. Grouped Settings: Security ── */}
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SECURITY & PRIVACY</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {/* Master PIN Lock */}
        <View style={styles.settingRow}>
          <View style={[styles.settingIconBg, { backgroundColor: colors.badgeBg }]}>
            <Ionicons name="lock-closed" size={18} color={colors.primary} />
          </View>
          <View style={styles.settingTextCol}>
            <Text style={[styles.settingTitle, { color: colors.text }]}>Require PIN on Launch</Text>
            <Text style={[styles.settingSub, { color: colors.textMuted }]}>
              Locks app when opened or resumed
            </Text>
          </View>
          <Switch
            value={lockEnabled}
            onValueChange={async (val) => {
              if (val && !hasCustomPin) {
                if (onSetupPin) onSetupPin();
              } else {
                await setLockEnabled(val);
                setLockEnabledState(val);
              }
            }}
            trackColor={{ false: colors.cardBorder, true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Biometrics */}
        {hasBioHardware && (
          <>
            <View style={[styles.itemDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.settingRow}>
              <View style={[styles.settingIconBg, { backgroundColor: colors.badgeBg }]}>
                <Ionicons name="finger-print" size={18} color={colors.primary} />
              </View>
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>Biometric Unlock</Text>
                <Text style={[styles.settingSub, { color: colors.textMuted }]}>
                  Fingerprint or Face sensor
                </Text>
              </View>
              <Switch
                value={bioEnabled}
                disabled={!lockEnabled}
                onValueChange={async (val) => {
                  await setBiometricsEnabled(val);
                  setBioEnabledState(val);
                }}
                trackColor={{ false: colors.cardBorder, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </>
        )}

        {/* Custom PIN */}
        <View style={[styles.itemDivider, { backgroundColor: colors.divider }]} />
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => {
            if (hasCustomPin) {
              if (onChangePin) onChangePin();
            } else {
              if (onSetupPin) onSetupPin();
            }
          }}
          activeOpacity={0.7}
        >
          <View style={[styles.settingIconBg, { backgroundColor: colors.badgeBg }]}>
            <Ionicons name="key" size={18} color={colors.primary} />
          </View>
          <View style={styles.settingTextCol}>
            <Text style={[styles.settingTitle, { color: colors.text }]}>Security PIN</Text>
            <Text style={[styles.settingSub, { color: colors.textMuted }]}>
              {hasCustomPin ? 'Change your 6-digit PIN' : 'Set a custom 6-digit PIN'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Lock Now Button */}
        {onLockApp && lockEnabled && (
          <>
            <View style={[styles.itemDivider, { backgroundColor: colors.divider }]} />
            <TouchableOpacity style={styles.settingRow} onPress={onLockApp} activeOpacity={0.7}>
              <View style={[styles.settingIconBg, { backgroundColor: colors.badgeBg }]}>
                <Ionicons name="shield" size={18} color={colors.primary} />
              </View>
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingTitle, { color: colors.primaryLabel }]}>Lock App Now</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── 6. Grouped Settings: Protocol & Community ── */}
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>PROTOCOL & COMMUNITY</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        {onOpenLeaderboard && (
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onOpenLeaderboard();
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIconBg, { backgroundColor: 'rgba(234, 179, 8, 0.15)' }]}>
              <Ionicons name="trophy" size={18} color="#eab308" />
            </View>
            <View style={styles.settingTextCol}>
              <Text style={[styles.settingTitle, { color: colors.text }]}>Seeker Hall of Fame</Text>
              <Text style={[styles.settingSub, { color: colors.textMuted }]}>
                Leaderboard & borrower rankings
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {onOpenJudgeBriefing && (
          <>
            <View style={[styles.itemDivider, { backgroundColor: colors.divider }]} />
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onOpenJudgeBriefing();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.settingIconBg, { backgroundColor: colors.badgeBg }]}>
                <Ionicons name="sparkles" size={18} color={colors.primary} />
              </View>
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>Judge Briefing</Text>
                <Text style={[styles.settingSub, { color: colors.textMuted }]}>
                  Architecture & security invariants
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        )}

        <View style={[styles.itemDivider, { backgroundColor: colors.divider }]} />
        <TouchableOpacity style={styles.settingRow} onPress={openExplorer} activeOpacity={0.7}>
          <View style={[styles.settingIconBg, { backgroundColor: colors.badgeBg }]}>
            <Ionicons name="open-outline" size={18} color={colors.primary} />
          </View>
          <View style={styles.settingTextCol}>
            <Text style={[styles.settingTitle, { color: colors.text }]}>Solana Explorer</Text>
            <Text style={[styles.settingSub, { color: colors.textMuted }]}>
              View ClockLend program on Solscan
            </Text>
          </View>
          <Ionicons name="open-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* ── 7. Logout / Disconnect ── */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, marginTop: 12 }]}>
        <TouchableOpacity style={styles.settingRow} onPress={onDisconnectWallet} activeOpacity={0.7}>
          <View style={[styles.settingIconBg, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          </View>
          <View style={styles.settingTextCol}>
            <Text style={[styles.settingTitle, { color: colors.danger }]}>Disconnect Wallet</Text>
            <Text style={[styles.settingSub, { color: colors.textMuted }]}>
              End active Seeker session
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.danger} />
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
    padding: 18,
    marginBottom: 16,
  },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  avatarHex: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  addressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addressText: {
    fontSize: 13,
    fontWeight: '500',
  },
  badgesStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
  },
  chainBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  cardSub: {
    fontSize: 12,
    marginTop: 2,
  },
  tierTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  tierTagText: {
    fontSize: 12,
    fontWeight: '800',
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  scoreCol: {
    flex: 1,
  },
  scoreColRight: {
    alignItems: 'flex-end',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  scoreBig: {
    fontSize: 26,
    fontWeight: '800',
  },
  historyVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressContainer: {
    marginTop: 4,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressVal: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  tokenPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
  },
  tokenPillText: {
    fontSize: 13,
    fontWeight: '800',
  },
  presetGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  presetBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  unstakeBtn: {
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 6,
  },
  unstakeText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
  },
  yieldBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
  },
  yieldAmount: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  claimBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  claimBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  totalUsd: {
    fontSize: 15,
    fontWeight: '600',
  },
  assetList: {
    marginVertical: 4,
  },
  assetItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  assetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  assetIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assetIconText: {
    fontSize: 16,
    fontWeight: '800',
  },
  assetSymbol: {
    fontSize: 15,
    fontWeight: '700',
  },
  assetName: {
    fontSize: 12,
  },
  assetBalance: {
    fontSize: 16,
    fontWeight: '700',
  },
  itemDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  manageAssetsBtn: {
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 8,
  },
  manageAssetsText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginLeft: 4,
    marginBottom: 8,
    marginTop: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  settingIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingTextCol: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  settingSub: {
    fontSize: 12,
    marginTop: 2,
  },
});
