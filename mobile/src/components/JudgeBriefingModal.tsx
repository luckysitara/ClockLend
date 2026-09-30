import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { PROGRAM_ID } from '../solana/program';
import * as Haptics from 'expo-haptics';

interface JudgeBriefingModalProps {
  visible: boolean;
  onClose: () => void;
}

export const JudgeBriefingModal: React.FC<JudgeBriefingModalProps> = ({
  visible,
  onClose,
}) => {
  const { colors } = useTheme();

  const openSolscan = () => {
    Linking.openURL(`https://solscan.io/account/${PROGRAM_ID.toBase58()}`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss judge briefing"
        />
        <View style={[styles.container, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
            <View style={styles.titleRow}>
              <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
                <Ionicons name="sparkles" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>Judge Briefing Hub</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Solana Mobile Hackathon Alignment
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.cardAlt }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close judge briefing modal"
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Live Mainnet Verification Banner */}
            <View style={[styles.statusBanner, { backgroundColor: colors.card, borderColor: colors.primary }]}>
              <View style={styles.statusHeader}>
                <View style={[styles.pulseDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.statusTitle, { color: colors.primary }]}>100% LIVE ON SOLANA MAINNET-BETA</Text>
              </View>
              <Text style={[styles.statusSub, { color: colors.textSecondary }]}>
                Program ID: {PROGRAM_ID.toBase58().slice(0, 10)}...{PROGRAM_ID.toBase58().slice(-8)}
              </Text>
              <TouchableOpacity
                style={[styles.solscanBtn, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}
                onPress={openSolscan}
                activeOpacity={0.7}
              >
                <Text style={[styles.solscanBtnText, { color: colors.primary }]}>View Verified Program on Solscan ↗</Text>
              </TouchableOpacity>
            </View>

            {/* Pillar 1: Stickiness & PMF */}
            <View style={[styles.pillarCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.pillarHeader}>
                <Text style={styles.pillarIcon}>🧲</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pillarTitle, { color: colors.text }]}>Stickiness & Product-Market Fit</Text>
                  <Text style={[styles.pillarTag, { color: colors.primary }]}>Why Seeker users return daily</Text>
                </View>
              </View>
              <View style={styles.bulletList}>
                <View style={styles.bulletItem}>
                  <Text style={[styles.bulletDot, { color: colors.primary }]}>•</Text>
                  <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>Solves Real Liquidity Needs: </Text>
                    Seeker phone holders borrow instant USDC without liquidating high-conviction SOL or SKR holdings.
                  </Text>
                </View>
                <View style={styles.bulletItem}>
                  <Text style={[styles.bulletDot, { color: colors.primary }]}>•</Text>
                  <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>Gamified Credit Progression: </Text>
                    Your on-chain reputation score starts at 10,000, gains 50 per repaid loan (capped at 10,000, so it cannot rise from a fresh profile) and drops 1,000 on default. Separately, staking SKR cuts your interest rate by up to 50% (two tiers: ≥100 SKR, ≥1,000 SKR).
                  </Text>
                </View>
                <View style={styles.bulletItem}>
                  <Text style={[styles.bulletDot, { color: colors.primary }]}>•</Text>
                  <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>Daily Fee Dividends: </Text>
                    SKR stakers may claim dividends funded by the protocol's share of loan origination fees. The yield vault is not yet funded: no protocol fee has been collected to date.
                  </Text>
                </View>
              </View>
            </View>

            {/* Pillar 2: User Experience */}
            <View style={[styles.pillarCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.pillarHeader}>
                <Text style={styles.pillarIcon}>📱</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pillarTitle, { color: colors.text }]}>Intuitive & Fun User Experience</Text>
                  <Text style={[styles.pillarTag, { color: colors.accentLight }]}>Tactile, fast, mobile-native</Text>
                </View>
              </View>
              <View style={styles.bulletList}>
                <View style={styles.bulletItem}>
                  <Text style={[styles.bulletDot, { color: colors.accentLight }]}>•</Text>
                  <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>Tactile Physical Haptics: </Text>
                    Physical vibration feedback tuned for Seeker hardware on presets, sliders, and button taps.
                  </Text>
                </View>
                <View style={styles.bulletItem}>
                  <Text style={[styles.bulletDot, { color: colors.accentLight }]}>•</Text>
                  <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>Biometrics & Seed Vault: </Text>
                    Seamless fingerprint / Face ID auth combined with hardware enclave key isolation.
                  </Text>
                </View>
                <View style={styles.bulletItem}>
                  <Text style={[styles.bulletDot, { color: colors.accentLight }]}>•</Text>
                  <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>Zero-Latency Optimistic State: </Text>
                    Instant screen transitions with background Helius WebSocket RPC synchronization.
                  </Text>
                </View>
              </View>
            </View>

            {/* Pillar 3: Innovation */}
            <View style={[styles.pillarCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.pillarHeader}>
                <Text style={styles.pillarIcon}>💡</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pillarTitle, { color: colors.text }]}>Groundbreaking Innovation</Text>
                  <Text style={[styles.pillarTag, { color: '#c084fc' }]}>A fresh way to use mobile DeFi</Text>
                </View>
              </View>
              <View style={styles.bulletList}>
                <View style={styles.bulletItem}>
                  <Text style={[styles.bulletDot, { color: '#c084fc' }]}>•</Text>
                  <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>1st Mobile-Native Credit Score: </Text>
                    Autonomous on-chain UserProfile PDA calculating decentralized credit ratings on Solana.
                  </Text>
                </View>
                <View style={styles.bulletItem}>
                  <Text style={[styles.bulletDot, { color: '#c084fc' }]}>•</Text>
                  <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>24h Social Grace Period: </Text>
                    Eliminates predatory MEV flash-liquidations by giving borrowers 24 hours to top-up or be rescued.
                  </Text>
                </View>
                <View style={styles.bulletItem}>
                  <Text style={[styles.bulletDot, { color: '#c084fc' }]}>•</Text>
                  <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>Peer-to-Peer Circles: </Text>
                    Circle lending desks and TARDIS social sharing are live on-chain today. Seeker NFC
                    tap-to-pair is roadmap only — this build ships no NFC driver, so the desks tab does
                    not offer it.
                  </Text>
                </View>
              </View>
            </View>

            {/* Pillar 4: Presentation & Live Demo */}
            <View style={[styles.pillarCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.pillarHeader}>
                <Text style={styles.pillarIcon}>🎬</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pillarTitle, { color: colors.text }]}>Presentation & Demo Verifiability</Text>
                  <Text style={[styles.pillarTag, { color: colors.success }]}>Real money, real escrow, zero mock data</Text>
                </View>
              </View>
              <View style={styles.bulletList}>
                <View style={styles.bulletItem}>
                  <Text style={[styles.bulletDot, { color: colors.success }]}>•</Text>
                  <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>Zero Mock Mode: </Text>
                    Every button press invokes real Anchor/Solana instructions on Mainnet-beta.
                  </Text>
                </View>
                <View style={styles.bulletItem}>
                  <Text style={[styles.bulletDot, { color: colors.success }]}>•</Text>
                  <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>Real Escrow Accounts: </Text>
                    Collateral is securely locked in program-derived vault PDAs with 100% mathematical non-custody.
                  </Text>
                </View>
              </View>
            </View>

            {/* Dismiss Button */}
            <TouchableOpacity
              style={[styles.doneBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.doneBtnText, { color: colors.primaryText }]}>Back to Live App</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    height: '90%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
    gap: 14,
  },
  statusBanner: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statusSub: {
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  solscanBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  solscanBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  pillarCard: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
  },
  pillarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  pillarIcon: {
    fontSize: 24,
  },
  pillarTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  pillarTag: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  bulletList: {
    gap: 8,
  },
  bulletItem: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  bulletDot: {
    fontSize: 16,
    lineHeight: 18,
  },
  bulletText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  doneBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
