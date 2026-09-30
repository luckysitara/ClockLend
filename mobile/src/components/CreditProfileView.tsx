import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Linking, TextInput, Switch, Image } from 'react-native';
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
  // SKR yield vault (only rendered when the on-chain vault exists)
  yieldVault?: SkrYieldVaultState;
  yieldPosition?: UserYieldPositionState;
  onClaimYield?: () => void;
}

/* Account tab information architecture:
      Identity   who you are (header, largest type on the screen)
      Credit     bond tier + APR discount, progress to the next tier, record
      Staking    SKR bond position, stake/unstake controls and the yield it earns
      Wallet     holdings and the entry to asset management
      Security   lock, biometrics and device/protocol integrity
      About      Judge Briefing, Hall of Fame and the explorer link
      Logout     last, on its own, de-emphasised

   Sections are separated by a hairline rule and spacing rather than by wrapping
   every group in another rounded card, and every secondary item uses the same
   row shape (`styles.row`: icon, label, value/chevron) so lists read as lists. */
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
  const { colors, mode, toggleTheme } = useTheme();
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

  const shorten = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-6)}`;

  const rule = <View style={[styles.rule, { backgroundColor: colors.divider }]} />;

  // The claim action is gated on there actually being something to claim. A
  // button that always pays 0.0000 USDC trains the user to stop tapping it, and
  // the on-chain yield vault has never been funded, so today that is every user.
  // One derived value drives the label, the explanation and the button state.
  const accruedUsd = (yieldPosition?.accruedRewards ?? 0) / 1_000_000;
  const canClaimYield = !!onClaimYield && accruedUsd > 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Identity ───────────────────────────────────────────────────────
          Who you are: handle, wallet and on-chain reputation. Not a card —
          the type scale is what makes it the header of the screen. */}
      <View style={styles.identity}>
        <View style={styles.passportHeader}>
          <View style={[styles.passportAvatar, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Image source={require('../../assets/logo.png')} style={{ width: 24, height: 24 }} resizeMode="contain" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.handleRow}>
              <Text style={[styles.passportHandle, { color: colors.text }]}>{skrHandle}</Text>
              <View style={[styles.hardwareTag, { backgroundColor: colors.badgeBg }]}>
                <Text style={[styles.hardwareTagText, { color: colors.primaryLabel }]}>SEED VAULT</Text>
              </View>
            </View>
            <Text style={[styles.walletSub, { color: colors.textMuted }]}>
              {shorten(userProfile.pubkey)} • Solana Mainnet
            </Text>
          </View>
        </View>

        <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>On-Chain Reputation</Text>
        <Text style={[styles.scoreNumber, { color: colors.text }]}>
          {(userProfile.reputationScore / 100).toFixed(1)}%
        </Text>
      </View>

      {/* ── Credit ─────────────────────────────────────────────────────────
          Borrowing standing: the tier that prices your loans, progress to the
          next one, and the repayment record. C-2: progression tracks the ONLY
          input the program reads — available_skr = staked_skr - locked_skr
          (processor.rs:1905-1916). Reputation is shown in the header but
          grants no discount. */}
      <View style={[styles.section, { borderTopColor: colors.divider }]}>
        <View style={styles.sectionLabelRow}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>CREDIT</Text>
          <View style={[styles.tierTag, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
            <Text style={[styles.tierTagText, { color: colors.primaryLabel }]}>
              {tierDiscountLabel(userProfile.tier)}
            </Text>
          </View>
        </View>

        <View style={styles.tierProgressHeader}>
          <Text style={[styles.tierProgressTitle, { color: colors.textSecondary }]}>
            SKR Bond Tier Progression
          </Text>
          <Text style={[styles.tierProgressNext, { color: colors.primaryLabel }]}>
            {userProfile.tier === 'Tier 2'
              ? 'Tier 2 — 50% APR discount active'
              : userProfile.tier === 'Tier 1'
              ? 'Next: Tier 2 at 1,000 SKR available (50% discount)'
              : 'Next: Tier 1 at 100 SKR available (25% discount)'}
          </Text>
        </View>
        <View style={[styles.tierBarTrack, { backgroundColor: colors.cardAlt }]}>
          <View
            style={[
              styles.tierBarFill,
              {
                backgroundColor: colors.primary,
                width: `${Math.min(100, Math.max(2, (userProfile.availableSkr / 1000) * 100))}%`,
              },
            ]}
          />
        </View>
        <Text style={[styles.tierPerkText, { color: colors.textMuted }]}>
          {userProfile.availableSkr.toLocaleString()} SKR counts toward the tier
          {userProfile.lockedSkr > 0
            ? ` (${userProfile.lockedSkr.toLocaleString()} SKR bonded to active loans)`
            : ''}{' '}
          • Program APR discount: {userProfile.aprDiscount}%
        </Text>

        {rule}

        <View style={styles.row}>
          <View style={styles.rowIcon}>
            <Ionicons name="checkmark-done-outline" size={17} color={colors.textMuted} />
          </View>
          <Text style={[styles.statsNote, { color: colors.textSecondary, flex: 1 }]}>
            {userProfile.totalLoansCompleted} loans completed on time • {userProfile.totalLoansDefaulted} defaults
          </Text>
        </View>
      </View>

      {/* ── Staking & earnings ─────────────────────────────────────────────
          The bond position and the yield it earns are one subject: the same
          stake produces both the APR discount and the protocol-fee dividends. */}
      <View style={[styles.section, { borderTopColor: colors.divider }]}>
        <View style={styles.sectionLabelRow}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>STAKING & EARNINGS</Text>
          <View style={[styles.trackPill, { backgroundColor: colors.badgeBg }]}>
            <Text style={[styles.trackPillText, { color: colors.primaryLabel }]}>$10,000 SKR Track</Text>
          </View>
        </View>
        <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
          Stake SKR into the protocol escrow to earn a program APR discount: 100+ SKR available = 25%,
          1,000+ SKR available = 50%. SKR bonded to an active loan is excluded from both tiers.
        </Text>

        <Text style={[styles.heroLabel, { color: colors.textMuted }]}>Staked in Protocol Escrow</Text>
        <Text style={[styles.heroValue, { color: colors.text }]}>
          {userProfile.stakedSkr.toLocaleString()} SKR
        </Text>
        <Text style={[styles.heroNote, { color: colors.textSecondary }]}>
          {userProfile.availableSkr.toLocaleString()} SKR available
          {userProfile.lockedSkr > 0
            ? ` • ${userProfile.lockedSkr.toLocaleString()} SKR bonded to active loans`
            : ''}
        </Text>

        <View style={styles.stakeBtnRow}>
          {[500, 1000, 2500, 5000].map((amt) => (
            <TouchableOpacity
              key={amt}
              style={[styles.stakePresetBtn, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onStakeSkr(amt);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.stakePresetText, { color: colors.primaryLabel }]}>+{amt} SKR</Text>
            </TouchableOpacity>
          ))}
        </View>

        {onUnstakeSkr && (
          <TouchableOpacity
            style={[
              styles.stakePresetBtn,
              { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder, marginTop: 10 },
              userProfile.availableSkr === 0 && { opacity: 0.45 },
            ]}
            onPress={() => {
              // The program rejects an unstake above staked_skr - locked_skr
              // with StakeLocked (processor.rs:902), so only the available
              // balance is offered.
              if (userProfile.availableSkr > 0) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onUnstakeSkr(userProfile.availableSkr);
              }
            }}
            disabled={userProfile.availableSkr === 0}
            activeOpacity={0.7}
          >
            <Text style={[styles.stakePresetText, { color: '#ff6b6b' }]}>
              ↩ Unstake {userProfile.availableSkr.toLocaleString()} SKR
              {userProfile.availableSkr === 0
                ? userProfile.stakedSkr > 0
                  ? ' (all bonded to active loans)'
                  : ' (stake first)'
                : ''}
            </Text>
          </TouchableOpacity>
        )}

        {/* SKR Protocol Yield (rendered only when the on-chain vault exists) */}
        {yieldVault?.initialized && (
          <>
            <View style={[styles.rule, { backgroundColor: colors.divider, marginTop: 18 }]} />
            <Text style={[styles.subLabel, { color: colors.textMuted }]}>SKR PROTOCOL YIELD</Text>

            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Text style={styles.verifyIcon}>💧</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>
                  Accrued: ${((yieldPosition?.accruedRewards ?? 0) / 1_000_000).toFixed(4)} USDC
                </Text>
                <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                  {!yieldPosition || yieldPosition.stakedSkr <= 0
                    ? 'Stake SKR to start earning protocol-fee dividends.'
                    : accruedUsd > 0
                    ? `Your escrowed ${(yieldPosition.stakedSkr / 1_000_000).toLocaleString()} SKR earns protocol-fee dividends. Claim pays out hourly.`
                    : 'Dividends accrue when the protocol collects loan origination fees. No fees have been collected yet, so there is nothing to claim.'}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.claimYieldBtn,
                  { backgroundColor: colors.primary, borderColor: colors.primary },
                  !canClaimYield && { opacity: 0.6 },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  if (onClaimYield) onClaimYield();
                }}
                disabled={!canClaimYield}
                activeOpacity={0.85}
              >
                <Text style={[styles.claimYieldText, { color: colors.primaryText }]}>Claim</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* ── Wallet ─────────────────────────────────────────────────────────
          Holdings as a list rather than a boxed three-up grid, then the entry
          point to asset management. */}
      <View style={[styles.section, { borderTopColor: colors.divider }]}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted, marginBottom: 10 }]}>WALLET</Text>

        <View style={styles.blockTitleRow}>
          <Text style={[styles.blockTitle, { color: colors.text }]}>
            Wallet Holdings (Solana Mainnet)
          </Text>
          {walletAssets && (
            <Text style={[styles.totalUsdText, { color: colors.primaryLabel }]}>
              ${walletAssets.totalUsdValue.toFixed(2)}
            </Text>
          )}
        </View>

        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.textSecondary, flex: 1 }]}>SOL Balance</Text>
          <Text style={[styles.rowValue, { color: colors.text }]}>
            {(walletAssets?.solBalance || 0).toFixed(3)} SOL
          </Text>
        </View>
        {rule}
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.textSecondary, flex: 1 }]}>USDC</Text>
          <Text style={[styles.rowValue, { color: colors.text }]}>
            ${(walletAssets?.usdcBalance || 0).toFixed(2)}
          </Text>
        </View>
        {rule}
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.textSecondary, flex: 1 }]}>SKR Tokens</Text>
          <Text style={[styles.rowValue, { color: colors.text }]}>
            {(walletAssets?.skrBalance || 0).toFixed(0)} SKR
          </Text>
        </View>

        {onOpenAssetsModal && (
          <>
            {rule}
            <TouchableOpacity style={styles.row} onPress={onOpenAssetsModal} activeOpacity={0.7}>
              <View style={styles.rowIcon}>
                <Ionicons name="wallet-outline" size={17} color={colors.primary} />
              </View>
              <Text style={[styles.rowLink, { color: colors.primaryLabel, flex: 1 }]}>
                View & Manage Wallet Assets
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Security ───────────────────────────────────────────────────────
          Settings, not headline content: switches and actions stay quiet, and
          the hardware/protocol claims sit below their own rule. */}
      <View style={[styles.section, { borderTopColor: colors.divider }]}>
        <View style={styles.sectionLabelRow}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SECURITY</Text>
          <View style={[styles.methodsBadge, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
            <Text style={[styles.methodsBadgeText, { color: colors.primaryLabel }]}>
              {lockEnabled
                ? hasBioHardware && bioEnabled
                  ? 'PIN + Biometrics (2/2 Active)'
                  : 'PIN Only (1/2 Active)'
                : 'Protection Disabled'}
            </Text>
          </View>
        </View>

        {/* 1. Master Lock Toggle */}
        <View style={styles.row}>
          <View style={styles.rowIcon}>
            <Ionicons name="lock-closed-outline" size={17} color={colors.primary} />
          </View>
          <View style={styles.rowBody}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Require PIN on App Launch</Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
              Lock app whenever it opens or resumes from background.
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
            thumbColor={lockEnabled ? '#FFFFFF' : colors.textMuted}
          />
        </View>

        {/* 2. Biometric Fast Unlock (if supported on device) */}
        {hasBioHardware && (
          <>
            {rule}
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="finger-print" size={17} color={colors.primary} />
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Fingerprint / Face ID</Text>
                <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                  Fast 1-tap unlock using device biometric sensor.
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
                thumbColor={bioEnabled ? '#FFFFFF' : colors.textMuted}
              />
            </View>
          </>
        )}

        {/* 3. PIN & manual lock actions */}
        {rule}
        <TouchableOpacity
          style={styles.row}
          onPress={() => {
            if (hasCustomPin) {
              if (onChangePin) onChangePin();
            } else {
              if (onSetupPin) onSetupPin();
            }
          }}
          activeOpacity={0.7}
        >
          <View style={styles.rowIcon}>
            <Ionicons name="key-outline" size={17} color={colors.primary} />
          </View>
          <Text style={[styles.rowLink, { color: colors.text, flex: 1 }]}>
            {hasCustomPin ? 'Change PIN' : 'Set Custom PIN'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {onLockApp && lockEnabled && (
          <>
            {rule}
            <TouchableOpacity style={styles.row} onPress={onLockApp} activeOpacity={0.7}>
              <View style={styles.rowIcon}>
                <Ionicons name="lock-closed" size={15} color={colors.primary} />
              </View>
              <Text style={[styles.rowLink, { color: colors.primaryLabel, flex: 1 }]}>Lock Now</Text>
            </TouchableOpacity>
          </>
        )}

        {/* 4. Device & protocol integrity — claims rather than controls. */}
        {rule}
        <View style={styles.row}>
          <View style={styles.rowIcon}>
            <Text style={styles.verifyIcon}>🛡️</Text>
          </View>
          <View style={styles.rowBody}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Seed Vault Enclave</Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
              Cryptographic keys isolated in hardware enclave. Zero remote key exfiltration.
            </Text>
          </View>
        </View>
        {rule}
        <View style={styles.row}>
          <View style={styles.rowIcon}>
            <Text style={styles.verifyIcon}>📜</Text>
          </View>
          <View style={styles.rowBody}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Audited Protocol Logic</Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
              Non-custodial smart contracts executed with atomic escrow settlement on Solana.
            </Text>
          </View>
        </View>
      </View>

      {/* ── About ──────────────────────────────────────────────────────────
          Secondary links, below the content the user came for. */}
      <View style={[styles.section, { borderTopColor: colors.divider }]}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted, marginBottom: 4 }]}>ABOUT</Text>

        {/* Labelled second entry point to the Judge Briefing Hub — the sparkles
            chip in the header is icon-only. */}
        {onOpenJudgeBriefing && (
          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onOpenJudgeBriefing();
            }}
            activeOpacity={0.7}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="sparkles" size={17} color={colors.primary} />
            </View>
            <Text style={[styles.rowLink, { color: colors.text, flex: 1 }]}>
              Judge Briefing — how this works
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {onOpenLeaderboard && (
          <>
            {rule}
            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onOpenLeaderboard();
              }}
              activeOpacity={0.7}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="trophy" size={16} color="#eab308" />
              </View>
              <Text style={[styles.hallOfFameBtnText, { flex: 1 }]}>
                View Global Seeker Hall of Fame
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        )}

        {rule}
        <TouchableOpacity style={styles.row} onPress={openExplorer} activeOpacity={0.7}>
          <View style={styles.rowIcon}>
            <Ionicons name="open-outline" size={16} color={colors.primary} />
          </View>
          <Text style={[styles.rowLink, { color: colors.primaryLabel, flex: 1 }]}>
            View Protocol on Solana Explorer ↗
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Logout ─────────────────────────────────────────────────────── */}
      <View style={[styles.logoutBlock, { borderTopColor: colors.divider }]}>
        <TouchableOpacity style={styles.logoutBtn} onPress={onDisconnectWallet} activeOpacity={0.6}>
          <Ionicons name="log-out-outline" size={17} color={colors.danger} />
          <Text style={[styles.logoutBtnText, { color: colors.danger }]}>Logout</Text>
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
    paddingBottom: 40,
  },
  /* ── Identity ─────────────────────────────────────────────────────── */
  identity: {
    paddingTop: 6,
    paddingBottom: 4,
  },
  passportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  passportAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  passportHandle: {
    fontSize: 22,
    fontWeight: '800',
  },
  hardwareTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  hardwareTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  walletSub: {
    fontSize: 11,
    marginTop: 3,
  },
  scoreLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  scoreNumber: {
    fontSize: 32,
    fontWeight: '900',
  },
  /* ── Sections ─────────────────────────────────────────────────────── */
  section: {
    marginTop: 28,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  subLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 14,
    marginBottom: 2,
  },
  blockTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  blockTitle: {
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  sectionDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 16,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
  },
  /* ── Rows: one shared shape for every secondary item ──────────────── */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowIcon: {
    width: 22,
    alignItems: 'center',
  },
  rowBody: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  rowSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  rowLink: {
    fontSize: 13,
    fontWeight: '700',
  },
  statsNote: {
    fontSize: 12,
  },
  /* ── Credit ───────────────────────────────────────────────────────── */
  tierTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  tierTagText: {
    fontSize: 12,
    fontWeight: '800',
  },
  tierProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  tierProgressTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  tierProgressNext: {
    fontSize: 11,
    fontWeight: '800',
  },
  tierBarTrack: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  tierBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  tierPerkText: {
    fontSize: 10,
    fontWeight: '600',
  },
  /* ── Staking & earnings ───────────────────────────────────────────── */
  trackPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  trackPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  heroLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  heroValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  heroNote: {
    fontSize: 12,
    marginTop: 4,
  },
  stakeBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  stakePresetBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  stakePresetText: {
    fontSize: 12,
    fontWeight: '800',
  },
  verifyIcon: {
    fontSize: 17,
  },
  claimYieldBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  claimYieldText: {
    fontSize: 13,
    fontWeight: '800',
  },
  /* ── Wallet ───────────────────────────────────────────────────────── */
  totalUsdText: {
    fontSize: 14,
    fontWeight: '800',
  },
  /* ── Security ─────────────────────────────────────────────────────── */
  methodsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  methodsBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  /* ── About ────────────────────────────────────────────────────────── */
  hallOfFameBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#eab308',
  },
  /* ── Logout ───────────────────────────────────────────────────────── */
  logoutBlock: {
    marginTop: 32,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  logoutBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  /* Kept for the in-flight theme-token work: the Account tab has no theme
     switcher today, but ThemeContext still exposes mode/toggleTheme. */
  themeSwitchBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  themeSwitchText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
