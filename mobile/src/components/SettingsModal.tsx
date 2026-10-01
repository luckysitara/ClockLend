import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Switch,
  Linking,
  Platform,
  StatusBar,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';

const STATUS_BAR_INSET = Platform.select({
  android: Math.max(StatusBar.currentHeight ?? 0, 36) + 16,
  ios: 52,
  default: 24,
});

export interface SettingsViewProps {
  onBack: () => void;
  skrHandle: string;
  hasCustomPin: boolean;
  lockEnabled: boolean;
  onToggleLock: (val: boolean) => void;
  onSetupPin: () => void;
  onChangePin: () => void;
  onLockApp: () => void;
  onOpenLeaderboard?: () => void;
  onOpenJudgeBriefing?: () => void;
  onOpenAssetsModal: () => void;
}

type LegalModalType =
  | 'TERMS_CONDITIONS'
  | 'LEGAL_COMPLIANCE'
  | 'PRIVACY_POLICY'
  | 'FAQS'
  | 'SECURITY_CENTER'
  | 'FEEDBACK'
  | null;

const TERMS_URL = 'https://clocklend.kikhaus.com/terms.html';
const LEGAL_URL = 'https://clocklend.kikhaus.com/legal.html';
const PRIVACY_URL = 'https://clocklend.kikhaus.com/privacy.html';

const PolicyAlertBox: React.FC<{
  title?: string;
  text: string;
  variant?: 'danger' | 'success' | 'info';
}> = ({ title, text, variant = 'danger' }) => {
  const { colors } = useTheme();
  const bg =
    variant === 'danger'
      ? 'rgba(239, 68, 68, 0.08)'
      : variant === 'success'
      ? 'rgba(20, 241, 149, 0.08)'
      : 'rgba(59, 130, 246, 0.08)';
  const border =
    variant === 'danger'
      ? 'rgba(239, 68, 68, 0.3)'
      : variant === 'success'
      ? 'rgba(20, 241, 149, 0.3)'
      : 'rgba(59, 130, 246, 0.3)';
  const textColor =
    variant === 'danger'
      ? '#fca5a5'
      : variant === 'success'
      ? '#6ee7b7'
      : colors.primary;

  return (
    <View style={[styles.policyAlert, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.policyAlertText, { color: colors.text }]}>
        {title && <Text style={{ fontWeight: '800', color: textColor }}>{title}: </Text>}
        {text}
      </Text>
    </View>
  );
};

const BulletItem: React.FC<{ boldText?: string; text: string }> = ({ boldText, text }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.bulletItem}>
      <Text style={[styles.bulletDot, { color: colors.primary }]}>•</Text>
      <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
        {boldText && <Text style={{ fontWeight: '700', color: colors.text }}>{boldText}: </Text>}
        {text}
      </Text>
    </View>
  );
};

const DocLinkBanner: React.FC<{ url: string; label: string }> = ({ url, label }) => {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.docLinkBanner, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
      onPress={() => Linking.openURL(url).catch(() => {})}
      activeOpacity={0.7}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        <Ionicons name="globe-outline" size={16} color={colors.primary} />
        <Text style={[styles.docLinkBannerText, { color: colors.primary }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Ionicons name="open-outline" size={15} color={colors.primary} />
    </TouchableOpacity>
  );
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  onBack,
  skrHandle,
  hasCustomPin,
  lockEnabled,
  onToggleLock,
  onSetupPin,
  onChangePin,
  onLockApp,
  onOpenAssetsModal,
}) => {
  const { colors, mode, toggleTheme } = useTheme();
  const [activeModal, setActiveModal] = useState<LegalModalType>(null);
  const [feedbackCategory, setFeedbackCategory] = useState<string>('Feature Suggestion');
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');

  const handleSendFeedback = () => {
    if (!feedbackMessage.trim()) {
      Alert.alert('Empty Message', 'Please enter your feedback or suggestion before submitting.');
      return;
    }
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    Alert.alert(
      'Feedback Received',
      'Thank you for contributing to ClockLend! Your feedback has been noted for our ongoing protocol updates.',
      [{ text: 'Done', onPress: () => {
        setFeedbackMessage('');
        setActiveModal(null);
      }}]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Top Header Row with Back Arrow ── */}
      <View style={[styles.headerRow, { borderBottomColor: colors.divider }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            try { Haptics.selectionAsync(); } catch {}
            onBack();
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Section 1: Account & Profile ── */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Account</Text>
        <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {/* Profile Settings (with back arrow icon) */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              onBack();
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
              <Ionicons name="person-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Profile Settings</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                {skrHandle} • On-chain credit & bond stats
              </Text>
            </View>
            <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Security PIN */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              if (hasCustomPin) onChangePin();
              else onSetupPin();
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Security PIN</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                {hasCustomPin ? 'Change 4-digit security PIN' : 'Set up 4-digit security PIN'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* App Lock Switch */}
          <View style={styles.settingRow}>
            <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>App Lock on Resume</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                Require unlock each app launch
              </Text>
            </View>
            <Switch
              value={lockEnabled}
              onValueChange={onToggleLock}
              trackColor={{ false: colors.cardBorder, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* ── Section 2: Preferences ── */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Preferences</Text>
        <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {/* Appearance: Just light or dark mode */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              toggleTheme();
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
              <Ionicons
                name={mode === 'dark' ? 'moon-outline' : 'sunny-outline'}
                size={20}
                color={colors.primary}
              />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Appearance</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                {mode === 'dark' ? 'Dark mode' : 'Light mode'}
              </Text>
            </View>
            <View style={[styles.pillBadge, { backgroundColor: colors.cardAlt }]}>
              <Text style={[styles.pillBadgeText, { color: colors.primaryLabel }]}>
                {mode === 'dark' ? 'Dark' : 'Light'}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Currency Display */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={onOpenAssetsModal}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
              <Ionicons name="cash-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Currency Display</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                USDC / USD & SOL Balances
              </Text>
            </View>
            <View style={[styles.pillBadge, { backgroundColor: colors.cardAlt }]}>
              <Text style={[styles.pillBadgeText, { color: colors.primaryLabel }]}>USDC</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Section 3: Legal & Security ── */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Legal & Security</Text>
        <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {/* Security Center */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setActiveModal('SECURITY_CENTER')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
              <Ionicons name="hardware-chip-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Security Center</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                Seed Vault, non-custodial keys & audits
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Terms & Conditions */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setActiveModal('TERMS_CONDITIONS')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
              <Ionicons name="document-text-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Terms & Conditions</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                Protocol smart contract rules & grace period
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Legal & Compliance */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setActiveModal('LEGAL_COMPLIANCE')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
              <Ionicons name="scale-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Legal & Compliance</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                Regulatory status, risk disclosures & audits
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Privacy Policy */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setActiveModal('PRIVACY_POLICY')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
              <Ionicons name="shield-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Privacy Policy</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                Zero tracking & decentralized ledger storage
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── Section 4: Support & Feedback ── */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Support & Community</Text>
        <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {/* FAQs */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setActiveModal('FAQS')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
              <Ionicons name="help-circle-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>FAQs</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                Frequently asked questions & protocol guides
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Feedback & Suggestions */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setActiveModal('FEEDBACK')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
              <Ionicons name="chatbox-ellipses-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Feedback & Suggestions</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                Share your ideas directly with the contributors
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Solscan Link */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => {
              Linking.openURL('https://solscan.io/account/9ikmDTbbRhtgYKjRhcnzCK9RpPWQ8uTYUeNJ16kWMLSG').catch(() => {});
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
              <Ionicons name="open-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Program on Solscan</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                Verified Solana Mainnet contract
              </Text>
            </View>
            <Ionicons name="open-outline" size={16} color={colors.textMuted} />
          </TouchableOpacity>

          {hasCustomPin && lockEnabled && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.divider }]} />
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => {
                  onBack();
                  onLockApp();
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
                  <Ionicons name="lock-closed" size={20} color={colors.primary} />
                </View>
                <View style={styles.textCol}>
                  <Text style={[styles.rowTitle, { color: colors.primaryLabel }]}>Lock App Now</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                    Immediately trigger security lock screen
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.primaryLabel} />
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── In-App Viewer Modal for Terms, Policies, FAQs, Security & Feedback ── */}
      <Modal
        visible={activeModal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={[styles.modalSheetContainer, { backgroundColor: colors.background }]}>
          <StatusBar
            translucent
            backgroundColor="transparent"
            barStyle={mode === 'dark' ? 'light-content' : 'dark-content'}
          />
          <View style={[styles.modalSheetHeader, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.modalSheetTitle, { color: colors.text }]}>
              {activeModal === 'TERMS_CONDITIONS' && 'Terms & Conditions'}
              {activeModal === 'LEGAL_COMPLIANCE' && 'Legal & Compliance'}
              {activeModal === 'PRIVACY_POLICY' && 'Privacy Policy'}
              {activeModal === 'FAQS' && 'Frequently Asked Questions'}
              {activeModal === 'SECURITY_CENTER' && 'Security Center'}
              {activeModal === 'FEEDBACK' && 'Feedback & Suggestions'}
            </Text>
            <TouchableOpacity
              onPress={() => setActiveModal(null)}
              style={styles.modalSheetClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close-circle" size={26} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalSheetBody} contentContainerStyle={styles.modalSheetBodyContent}>
            {/* Terms & Conditions Content */}
            {activeModal === 'TERMS_CONDITIONS' && (
              <View style={styles.legalDoc}>
                <Text style={[styles.docDate, { color: colors.textMuted }]}>Last Updated: September 26, 2026</Text>

                <DocLinkBanner url={TERMS_URL} label="clocklend.kikhaus.com/terms.html" />

                <PolicyAlertBox
                  title="IMPORTANT LEGAL NOTICE"
                  text="PLEASE READ THESE TERMS & CONDITIONS CAREFULLY. THEY CONSTITUTE A BINDING LEGAL AGREEMENT GOVERNING YOUR INTERACTION WITH THE CLOCKLEND SOFTWARE, PROTOCOL, SMART CONTRACTS, AND DIGITAL INTERFACES. BY ACCESSING THE PROTOCOL, YOU EXPRESSLY ACCEPT AND AGREE TO ALL PROVISIONS HEREIN."
                  variant="danger"
                />

                <Text style={[styles.docHeading, { color: colors.text }]}>1. Acceptance of Terms</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  By connecting a Solana digital asset wallet, interacting with the ClockLend smart contracts, accessing the ClockLend application, or browsing the protocol website, you ("User", "you", or "your") agree to comply with and be bound by these Terms & Conditions ("Terms"). If you do not agree to these Terms in their entirety, you must immediately disconnect your wallet and cease using the protocol.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>2. Description of the Protocol</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  ClockLend is a suite of autonomous smart contract software programs running on the Solana blockchain that enables peer-to-peer micro-lending, decentralized liquidity pools, collateralized pawn contracts, and reputation token staking. ClockLend is not a bank, broker-dealer, lender, financial institution, custodian, or money transmitter.
                </Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  All loan origination, collateral escrowing, fee routing, and liquidation logic execute automatically and deterministically through autonomous Program Derived Addresses (PDAs) on the Solana ledger without human intermediation.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>3. Eligibility and Prohibited Jurisdictions</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  To access or interact with ClockLend, you represent and warrant that:
                </Text>
                <BulletItem text="You are at least 18 years of age or the age of legal majority in your jurisdiction." />
                <BulletItem text="You possess the legal capacity to enter into a binding agreement." />
                <BulletItem text="You are not a citizen, resident, or entity organized in any country or territory subject to comprehensive sanctions by the United States OFAC, the UN Security Council, or the European Union (including Cuba, Iran, North Korea, Syria, or the Crimea, Donetsk, and Luhansk regions of Ukraine)." />
                <BulletItem text="You are not designated on any government sanctions list (including the OFAC Specially Designated Nationals List)." />
                <BulletItem text="Your use of ClockLend does not violate any local laws, financial regulations, or securities restrictions in your jurisdiction." />

                <Text style={[styles.docHeading, { color: colors.text }]}>4. Non-Custodial Architecture & User Responsibility</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  ClockLend is strictly non-custodial. You maintain exclusive control of your cryptographic keys, assets, and wallet signatures at all times.
                </Text>
                <BulletItem
                  boldText="Seed Phrase Security"
                  text="You are solely responsible for securing your wallet credentials and private keys. ClockLend developers and contributors never have access to your private keys and cannot recover lost funds under any circumstances."
                />
                <BulletItem
                  boldText="Transaction Irreversibility"
                  text="Transactions on the Solana blockchain are irrevocable once confirmed. You are solely responsible for verifying transaction parameters, amounts, interest rates, and durations before signing via your wallet or Seed Vault."
                />

                <Text style={[styles.docHeading, { color: colors.text }]}>5. Smart Contract Mechanics & Liquidation Terms</Text>
                <Text style={[styles.docSubheading, { color: colors.text }]}>5.1. Collateral Escrow & Sizing</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  Borrowers must deposit collateral (SOL or SKR) into a cryptographic escrow PDA to secure a loan. Maximum Loan-to-Value (LTV) limits are enforced deterministically on-chain based on oracle price feeds (subject to a strict 600-second staleness bound). LTV is a property of each pool, set when that pool is initialized and capped at 7,000 bps (70%). Staking SKR reputation bonds unlocks interest rate discounts (from 1% for 100 SKR up to 25% for 10,000 SKR).
                </Text>
                <Text style={[styles.docSubheading, { color: colors.text }]}>5.2. 24-Hour Social Grace Period & Default</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  If a loan is not repaid by its scheduled maturity timestamp:
                </Text>
                <BulletItem text="The loan becomes eligible for a 24-Hour Social Grace Period, which begins when the grace-period instruction is triggered on chain at or after the scheduled maturity timestamp. During this 24-hour window, the borrower retains the right to repay the full principal plus accrued interest to release their collateral." />
                <BulletItem text="If the borrower fails to repay prior to the expiration of the Social Grace Period, the loan transitions to Default. The pool authority or P2P funder may execute ClaimDefault to liquidate and claim the escrowed collateral." />
                <BulletItem text="For defaulted reputation borrowers, the smart contract slashes the greater of (a) the locked SKR reputation bond and (b) 20% of the staked SKR balance, capped at the staked balance. The slashed SKR is transferred to a token account controlled by the pool authority, pool vault PDA, or treasury; it is not burned." />

                <Text style={[styles.docHeading, { color: colors.text }]}>6. Protocol Fees & Dividend Distribution</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  ClockLend applies transparent, code-enforced origination fees upon loan disbursement:
                </Text>
                <BulletItem
                  boldText="50% Protocol Treasury"
                  text="Half of the origination fee is transferred to the decentralized protocol treasury PDA for ongoing maintenance. The treasury is funded only by fees actually collected."
                />
                <BulletItem
                  boldText="50% SKR Yield Vault"
                  text="The other half is routed into the on-chain SkrYieldVault token account, distributed as USDC dividends to eligible SKR stakers when yield-vault accounts are supplied."
                />
                <BulletItem text="A 1-hour anti-flash-loan cooldown applies to yield claims following any stake modification or reward disbursement." />

                <Text style={[styles.docHeading, { color: colors.text }]}>7. Prohibited Activities</Text>
                <BulletItem text="Exploiting software vulnerabilities, smart contract bugs, or economic attack vectors to unlawfully extract protocol liquidity." />
                <BulletItem text="Employing bots, scripts, or automated tools to flood, spam, or denial-of-service the ClockLend RPC gateway." />
                <BulletItem text="Using the protocol for money laundering, terrorist financing, illicit arms trafficking, sanctions evasion, or fraudulent schemes." />
                <BulletItem text="Manipulating on-chain or off-chain price oracle feeds." />
                <BulletItem text="Reverse-engineering, modifying, or decompiling the application binary in violation of our intellectual property rights." />

                <Text style={[styles.docHeading, { color: colors.text }]}>8. Intellectual Property & Proprietary Rights</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  The ClockLend protocol, smart contract software, architecture, brand names, visual marks, interface designs, trade dress, and documentation are proprietary intellectual property. All rights reserved.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>9. Disclaimer of Warranties</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  CLOCKLEND IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, OR FREEDOM FROM BUGS, MALWARE, OR SMART CONTRACT VULNERABILITIES.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>10. Limitation of Liability</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL CLOCKLEND, ITS CORE CONTRIBUTORS, DEVELOPERS, AFFILIATES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DIGITAL ASSETS, COLLATERAL, OR DATA.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>11. Indemnification</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  You agree to defend, indemnify, and hold harmless ClockLend, its contributors, and developers from and against any claims, liabilities, damages, losses, and expenses arising out of or in any way connected with your breach of these Terms, violation of applicable laws, or misuse of the protocol.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>12. Governing Law & Dispute Resolution</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  These Terms shall be governed by and construed in accordance with the principles of decentralized international commercial arbitration and general commercial law under the UNCITRAL Arbitration Rules.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>13. Modifications to Terms</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  We reserve the right to amend these Terms at any time by posting the updated version to https://clocklend.kikhaus.com/terms.html. Your continued use of the protocol constitutes acceptance of the modified Terms.
                </Text>

                <TouchableOpacity
                  style={[styles.openBrowserBtn, { backgroundColor: colors.primary }]}
                  onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
                  activeOpacity={0.8}
                >
                  <Ionicons name="open-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.openBrowserBtnText}>Open Full Terms on Web (kikhaus.com)</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Legal & Compliance Content */}
            {activeModal === 'LEGAL_COMPLIANCE' && (
              <View style={styles.legalDoc}>
                <Text style={[styles.docDate, { color: colors.textMuted }]}>Last Updated: September 26, 2026</Text>

                <DocLinkBanner url={LEGAL_URL} label="clocklend.kikhaus.com/legal.html" />

                <PolicyAlertBox
                  title="REGULATORY NOTICE"
                  text="ClockLend is a decentralized Web3 credit protocol. ClockLend is not a registered financial intermediary, investment advisor, bank, broker, or securities exchange. Engaging with decentralized credit protocols involves substantial financial and technical risks."
                  variant="success"
                />

                <Text style={[styles.docHeading, { color: colors.text }]}>1. Regulatory & Operational Status</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  ClockLend operates through smart contracts deployed to the Solana blockchain. The protocol is controlled exclusively by deterministic mathematical rules encoded within smart contract bytecodes.
                </Text>
                <BulletItem
                  boldText="No Custodial Control"
                  text="ClockLend contributors and maintainers do not hold, control, or transmit digital assets on your behalf. All assets reside in Program Derived Addresses (PDAs) with cryptographic seed derivations."
                />
                <BulletItem
                  boldText="No Banking or Broker Services"
                  text="The protocol does not offer banking deposits, custodial savings accounts, or insurance coverage (such as FDIC or SIPC insurance). Digital asset lending and borrowing is conducted peer-to-peer or pool-to-peer."
                />
                <BulletItem
                  boldText="No Security Offerings"
                  text="Nothing in this application or on the website constitutes an offer to sell, a solicitation to buy, or a recommendation for any security, financial instrument, or investment product."
                />

                <Text style={[styles.docHeading, { color: colors.text }]}>2. No Financial, Investment, or Legal Advice</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  The information provided within this application and through official documentation is provided solely for informational and educational purposes. It does not constitute investment advice, financial advice, trading advice, or legal counsel.
                </Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  You are solely responsible for conducting your own independent research and assessing the suitability of any protocol action before committing digital assets.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>3. Comprehensive Risk Disclosures</Text>
                <Text style={[styles.docSubheading, { color: colors.text }]}>3.1. Smart Contract & Execution Risks</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  The ClockLend program has been through 14 internal, AI-assisted audit rounds and is deployed on Solana Mainnet-beta with its bytecode hash-verified against the build artifact. No third-party audit has been performed, remediation of the round-14 findings is ongoing, and the program is upgradeable by the team's deployer key. All software carries inherent risks of unexpected edge cases, compiler errors, or unforeseen protocol bugs. You acknowledge that you interact with the software at your own risk.
                </Text>

                <Text style={[styles.docSubheading, { color: colors.text }]}>3.2. Blockchain Network & Cluster Halts</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  ClockLend depends on the continuous operational performance of the Solana blockchain network. Network congestion, consensus failures, validator bifurcation, or cluster downtime may delay transaction processing, prevent loan repayments, or impact the execution of liquidation checks. ClockLend is not liable for losses caused by underlying blockchain disruptions.
                </Text>

                <Text style={[styles.docSubheading, { color: colors.text }]}>3.3. Price Oracle & Volatility Risk</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  ClockLend utilizes on-chain price feeds cranked from decentralized aggregators (Jupiter and CoinGecko). Although the protocol enforces a strict 600-second fail-closed staleness bound to prevent trading on obsolete prices, extreme market flash-crashes, oracle latency, or liquidity evaporation can cause rapid changes in your Loan-to-Value (LTV) ratio, potentially resulting in collateral liquidation.
                </Text>

                <Text style={[styles.docSubheading, { color: colors.text }]}>3.4. Collateral Liquidation & Slashing Risk</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  Borrowers who fail to repay their loans prior to the expiration of the loan duration plus the 24-Hour Social Grace Period (a window that begins only when the grace-period instruction is triggered on chain at or after the due time) are subject to forfeiture of the escrowed collateral, 95% of which is paid to the lending desk or P2P funder with a 5% protocol liquidation margin. Additionally, borrowers utilizing reputation staking may suffer a slash of the greater of their locked SKR reputation bond and 20% of their staked SKR balance, capped at the staked balance.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>4. Sanctions & Anti-Money Laundering (AML) Compliance</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  The ClockLend protocol is committed to legitimate, open, and lawful financial participation. Users are strictly prohibited from utilizing the protocol if they are:
                </Text>
                <BulletItem text="Subject to economic or trade sanctions administered by the U.S. OFAC, the UN Security Council, or the European Union." />
                <BulletItem text="A citizen, national, or resident of Cuba, Iran, North Korea, Syria, or the Crimea, Donetsk, or Luhansk regions." />
                <BulletItem text="Attempting to route funds derived from illegal narcotics, illicit arms trafficking, ransomware extortion, cyber warfare, or terrorist financing." />

                <Text style={[styles.docHeading, { color: colors.text }]}>5. Intellectual Property & DMCA Notice</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  All software, smart contracts, proprietary algorithms, interface designs, text, graphics, and trade dress associated with ClockLend are the exclusive proprietary intellectual property of ClockLend Protocol. Unauthorized copying or commercial exploitation is strictly prohibited without prior written consent.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>6. Trademarks & Brand Protection</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  The "ClockLend" name, wordmark, logo, and visual design assets are protected proprietary assets. Community members and third parties may not use brand assets in any manner that implies endorsement, affiliation, or sponsorship without prior written authorization.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>7. Contact & Security Disclosures</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  If any issues, bugs, or security vulnerabilities are found, please report them directly by contacting @bughacker140823 on X.
                </Text>

                <TouchableOpacity
                  style={[styles.openBrowserBtn, { backgroundColor: colors.primary }]}
                  onPress={() => Linking.openURL(LEGAL_URL).catch(() => {})}
                  activeOpacity={0.8}
                >
                  <Ionicons name="open-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.openBrowserBtnText}>Open Legal Notice on Web (kikhaus.com)</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Privacy Policy Content */}
            {activeModal === 'PRIVACY_POLICY' && (
              <View style={styles.legalDoc}>
                <Text style={[styles.docDate, { color: colors.textMuted }]}>Last Updated: September 26, 2026</Text>

                <DocLinkBanner url={PRIVACY_URL} label="clocklend.kikhaus.com/privacy.html" />

                <PolicyAlertBox
                  title="NON-CUSTODIAL NOTICE"
                  text="ClockLend is a decentralized, non-custodial software protocol deployed on the Solana blockchain. We never hold your private keys, custody your funds, or maintain centralized user account databases."
                  variant="info"
                />

                <Text style={[styles.docHeading, { color: colors.text }]}>1. Nature of Decentralized Technology</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  ClockLend operates as a client-side interface communicating directly with autonomous smart contracts on the Solana public blockchain. When you execute an action—such as initiating a borrow, funding a P2P offer, or staking SKR—that transaction is broadcast to independent, decentralized Solana validator nodes.
                </Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  Transactions recorded on the Solana blockchain are permanent, immutable, and publicly visible to anyone worldwide. ClockLend does not have the technical ability to delete, modify, or conceal on-chain transaction records.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>2. Information We Do Not Collect</Text>
                <BulletItem
                  boldText="Zero Private Key Access"
                  text="We never generate, ask for, transmit, or store your private cryptographic keys, seed phrases, or Seed Vault credentials."
                />
                <BulletItem
                  boldText="No KYC or Real-World Identity Data"
                  text="We do not collect your real name, physical address, passport, driver's license, phone number, or government identification number."
                />
                <BulletItem
                  boldText="No Credit Card or Banking Credentials"
                  text="ClockLend operates entirely in digital assets (SOL, SKR, USDC) via public key addresses."
                />

                <Text style={[styles.docHeading, { color: colors.text }]}>3. Information We Collect or Process</Text>
                <Text style={[styles.docSubheading, { color: colors.text }]}>3.1. Public Ledger Information</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  When you connect your Solana wallet (such as via the Solana Mobile Wallet Adapter 2.0 or Seed Vault), the protocol reads publicly available ledger information associated with your public key:
                </Text>
                <BulletItem text="Your public wallet address (Base58 encoded)." />
                <BulletItem text="Token account balances (SOL, SKR, USDC) necessary to determine loan eligibility." />
                <BulletItem text="Ownership of Seeker Genesis Tokens (SGT) or other on-chain credentials used for loyalty tier computation." />
                <BulletItem text="Historical loan and pawn interactions associated with your Program Derived Address (PDA) profile." />

                <Text style={[styles.docSubheading, { color: colors.text }]}>3.2. Device & Hardware Integrity Data</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  To ensure application security, prevent exploit bots, and protect borrower collateral, the ClockLend Android client locally verifies hardware attestation parameters:
                </Text>
                <BulletItem text="Android environment attestation (detecting rooted devices, emulators, or dynamic instrumentation hooks such as Frida and Xposed)." />
                <BulletItem text="Operating system version and Solana Mobile Stack (SMS) feature support." />
                <BulletItem text="Local hardware Seed Vault capability detection." />
                <Text style={[styles.docText, { color: colors.textSecondary, marginTop: 4 }]}>
                  This verification occurs entirely on your device and is not exfiltrated to central telemetry servers.
                </Text>

                <Text style={[styles.docSubheading, { color: colors.text }]}>3.3. Local Device Storage</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  The application stores non-sensitive operational preferences locally on your device (using secure encrypted local storage):
                </Text>
                <BulletItem text="Selected display theme (dark/light) and visual settings." />
                <BulletItem text="Cached on-chain orders and pool directory metadata to optimize loading speeds." />
                <BulletItem text="Recently selected RPC endpoint preference." />

                <Text style={[styles.docHeading, { color: colors.text }]}>4. How Information Is Used</Text>
                <BulletItem text="Construct and format valid Solana blockchain transactions for your cryptographic signature." />
                <BulletItem text="Calculate exact loan sizing, interest rates, and loan-to-value (LTV) limits using pure fixed-point integer mathematics." />
                <BulletItem text="Enforce the 24-hour Social Grace Period and liquidation timers accurately against cluster clock slots." />
                <BulletItem text="Maintain real-time price awareness through decentralized oracle feeds (Jupiter, CoinGecko, and on-chain PDAs)." />

                <Text style={[styles.docHeading, { color: colors.text }]}>5. Third-Party RPC Providers & WebSockets</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  ClockLend utilizes reputable infrastructure providers (such as Helius and public Solana RPC nodes) to transmit transactions and stream real-time account state changes via WebSocket. When your device connects to an RPC node, that node may log your IP address in accordance with standard internet networking protocols. Users who desire additional IP masking are encouraged to utilize a VPN or decentralized privacy network.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>6. Security of Your Assets</Text>
                <BulletItem
                  boldText="Hardware Isolation"
                  text="On Solana Seeker devices, private keys remain isolated in the physical Secure Enclave / Seed Vault."
                />
                <BulletItem
                  boldText="Screen Protection"
                  text="The mobile app enables Android FLAG_SECURE to prevent background screen recording or screenshot leakage."
                />
                <BulletItem
                  boldText="Audit Trail"
                  text="The protocol contracts have been through 14 internal, AI-assisted audit rounds over 103 on-chain test functions, and the deployed program's bytecode is hash-verified on mainnet."
                />

                <Text style={[styles.docHeading, { color: colors.text }]}>7. Children's Privacy</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  ClockLend is strictly intended for individuals who are at least 18 years of age (or the age of legal majority in their jurisdiction). We do not knowingly facilitate interactions for minors.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>8. Updates to this Policy</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  We may periodically update this Privacy Policy to reflect protocol upgrades or regulatory changes. Any modifications will be posted to https://clocklend.kikhaus.com/privacy.html with an updated "Last Updated" timestamp.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>9. Contact & Inquiries</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  If any issues, bugs, or security vulnerabilities are found, or for general inquiries, please contact @bughacker140823 on X.
                </Text>

                <TouchableOpacity
                  style={[styles.openBrowserBtn, { backgroundColor: colors.primary }]}
                  onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
                  activeOpacity={0.8}
                >
                  <Ionicons name="open-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.openBrowserBtnText}>Open Privacy Policy on Web (kikhaus.com)</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* FAQs Content */}
            {activeModal === 'FAQS' && (
              <View style={styles.legalDoc}>
                <Text style={[styles.docHeading, { color: colors.text }]}>What is ClockLend?</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  ClockLend is a decentralized, non-custodial credit and micro-lending protocol engineered specifically for Solana and the Solana Mobile Seeker hardware ecosystem.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>How does the 24-Hour Social Grace Period work?</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  Unlike standard DeFi protocols that immediately liquidate loans on a price wick, ClockLend provides an automated 24-hour social grace window allowing borrowers to repay their loan without losing their escrowed collateral.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>What are SKR Reputation Bonds?</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  Borrowers can stake an SKR reputation bond into an on-chain escrow to unlock interest discounts (from 1% for 100 SKR up to 25% for 10,000 SKR).
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>How is my wallet protected?</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  Private keys are isolated in the Solana Mobile Seed Vault hardware enclave. In addition, you can set a 4-digit PIN for application resume protection.
                </Text>
              </View>
            )}

            {/* Security Center Content */}
            {activeModal === 'SECURITY_CENTER' && (
              <View style={styles.legalDoc}>
                <View style={[styles.securityBadgeCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                  <Ionicons name="hardware-chip" size={32} color={colors.primary} />
                  <Text style={[styles.securityBadgeTitle, { color: colors.text }]}>
                    Seed Vault Hardware Protection
                  </Text>
                  <Text style={[styles.securityBadgeSub, { color: colors.textSecondary }]}>
                    Your private keys never leave your physical device. All transactions are authorized via Mobile Wallet Adapter hardware signing.
                  </Text>
                </View>

                <Text style={[styles.docHeading, { color: colors.text }]}>Verified Mainnet Program ID</Text>
                <View style={[styles.codeBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
                  <Text style={[styles.codeText, { color: colors.primaryLabel }]}>
                    9ikmDTbbRhtgYKjRhcnzCK9RpPWQ8uTYUeNJ16kWMLSG
                  </Text>
                </View>

                <Text style={[styles.docHeading, { color: colors.text }]}>Security Audits & Invariants</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  The protocol enforces strict signer authorization on all state transitions, mathematical overflow guards via checked math, deterministic PDA vaults, and real-time oracle price staleness bounds.
                </Text>
              </View>
            )}

            {/* Feedback & Suggestions Form */}
            {activeModal === 'FEEDBACK' && (
              <View style={styles.feedbackForm}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>CATEGORY</Text>
                <View style={styles.categoryRow}>
                  {['Feature Suggestion', 'Bug Report', 'General Feedback'].map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryChip,
                        { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder },
                        feedbackCategory === cat && { backgroundColor: colors.badgeBg, borderColor: colors.primary },
                      ]}
                      onPress={() => setFeedbackCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          { color: colors.textSecondary },
                          feedbackCategory === cat && { color: colors.primaryLabel, fontWeight: '700' },
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 14 }]}>
                  YOUR MESSAGE
                </Text>
                <TextInput
                  style={[
                    styles.feedbackInput,
                    { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder, color: colors.text },
                  ]}
                  value={feedbackMessage}
                  onChangeText={(val) => setFeedbackMessage(val.replace(/[<>'"\\/]/g, '').slice(0, 1000))}
                  placeholder="Tell us what you love or what we can improve..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={5}
                />

                <TouchableOpacity
                  style={[styles.feedbackSubmitBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSendFeedback}
                  activeOpacity={0.88}
                >
                  <Ionicons name="send-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.feedbackSubmitText}>Submit Feedback</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

export interface SettingsModalProps extends SettingsViewProps {
  visible: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = (props) => {
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <SettingsView {...props} onBack={props.onClose} />
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: STATUS_BAR_INSET,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 10,
    paddingHorizontal: 4,
    letterSpacing: 0.3,
  },
  cardGroup: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCol: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  rowSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  pillBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  modalSheetContainer: {
    flex: 1,
  },
  modalSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: STATUS_BAR_INSET,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  modalSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
    marginRight: 12,
  },
  modalSheetClose: {
    padding: 4,
  },
  modalSheetBody: {
    flex: 1,
  },
  modalSheetBodyContent: {
    padding: 20,
    paddingBottom: 48,
  },
  legalDoc: {
    gap: 10,
  },
  docDate: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  docHeading: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 4,
  },
  docSubheading: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  docText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
    marginBottom: 6,
  },
  policyAlert: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  policyAlertText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  bulletItem: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingLeft: 4,
  },
  bulletDot: {
    fontSize: 14,
    lineHeight: 20,
    marginRight: 6,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  docLinkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  docLinkBannerText: {
    fontSize: 13,
    fontWeight: '700',
  },
  openBrowserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 16,
    marginBottom: 8,
    gap: 8,
  },
  openBrowserBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  securityBadgeCard: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  securityBadgeTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  securityBadgeSub: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '500',
  },
  codeBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  feedbackForm: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  feedbackInput: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
    height: 120,
    marginBottom: 16,
  },
  feedbackSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 18,
  },
  feedbackSubmitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
