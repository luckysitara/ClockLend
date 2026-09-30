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
  | 'TERMS_OF_USE'
  | 'PRIVACY_POLICY'
  | 'FAQS'
  | 'SECURITY_CENTER'
  | 'FEEDBACK'
  | null;

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

          {/* Terms of Use */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setActiveModal('TERMS_OF_USE')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
              <Ionicons name="reader-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Terms of Use</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                Acceptable use & non-custodial responsibility
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
          <View style={[styles.modalSheetHeader, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.modalSheetTitle, { color: colors.text }]}>
              {activeModal === 'TERMS_CONDITIONS' && 'Terms & Conditions'}
              {activeModal === 'TERMS_OF_USE' && 'Terms of Use'}
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
                <Text style={[styles.docHeading, { color: colors.text }]}>1. Non-Custodial Protocol</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  ClockLend is a non-custodial smart contract system deployed on the Solana blockchain. Users maintain sole cryptographic control over their digital assets through their private keys and hardware Seed Vault. The protocol does not intermediate, hold, custody, or transmit user funds.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>2. Escrow & Collateral Rules</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  All loans require deterministic on-chain collateralization (SOL or SKR). Collateral is locked directly in an autonomous Program Derived Address (PDA) escrow. The protocol enforces maximum Loan-to-Value (LTV) limits capped at 70%.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>3. 24-Hour Social Grace Period</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  Upon reaching loan maturity, positions are eligible for a 24-hour social grace period before collateral can be claimed. This mechanism protects borrowers against sudden flash crashes while maintaining deterministic rules for pool lenders.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>4. Protocol Risk Acknowledgement</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  Blockchain smart contracts carry inherent technical, market, and network risks. You agree that your participation is entirely voluntary and at your sole discretion.
                </Text>
              </View>
            )}

            {/* Terms of Use Content */}
            {activeModal === 'TERMS_OF_USE' && (
              <View style={styles.legalDoc}>
                <Text style={[styles.docHeading, { color: colors.text }]}>1. Eligibility & Permitted Use</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  By accessing the ClockLend mobile interface, you represent and warrant that you are of legal age and that your use complies with all applicable local regulations and sanctions laws.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>2. Non-Interference</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  You agree not to attempt to exploit, disrupt, manipulate price oracles, or tamper with the deterministic smart contracts running on Solana.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>3. Modification of Terms</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  These terms may be updated alongside open-source protocol releases. Continued access constitutes agreement with the prevailing version.
                </Text>
              </View>
            )}

            {/* Privacy Policy Content */}
            {activeModal === 'PRIVACY_POLICY' && (
              <View style={styles.legalDoc}>
                <Text style={[styles.docHeading, { color: colors.text }]}>1. Zero Tracking Architecture</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  ClockLend operates with zero centralized tracking databases. We do not collect names, email addresses, phone numbers, IP addresses, or government identification.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>2. Public Blockchain Ledger</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  Transactions executed via the Solana blockchain are inherently transparent, immutable, and publicly verifiable on the global distributed ledger.
                </Text>

                <Text style={[styles.docHeading, { color: colors.text }]}>3. Local Device Preferences</Text>
                <Text style={[styles.docText, { color: colors.textSecondary }]}>
                  Local preferences (such as your PIN hash, theme mode, and app lock setting) are saved exclusively on your physical mobile device using secure encrypted storage and are never uploaded to any external server.
                </Text>
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
                  Borrowers can stake an SKR reputation bond into an on-chain escrow to unlock interest discounts (100 SKR grants a 25% discount; 1,000 SKR grants a 50% discount).
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
                  onChangeText={setFeedbackMessage}
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 16,
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
    paddingVertical: 18,
    borderBottomWidth: 1,
  },
  modalSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalSheetClose: {
    padding: 2,
  },
  modalSheetBody: {
    flex: 1,
  },
  modalSheetBodyContent: {
    padding: 20,
    paddingBottom: 48,
  },
  legalDoc: {
    gap: 12,
  },
  docHeading: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 4,
  },
  docText: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
    marginBottom: 10,
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
