import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { connectSeekerWallet, SeekerSession } from '../solana/seekerWallet';

const LOGO_IMG = require('../../assets/logo.png');

interface ConnectWalletViewProps {
  onConnected: (session: SeekerSession) => void;
}

interface OnboardingSlide {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: 'instant_borrow',
    icon: 'flash',
    title: 'Instant USDC Borrow',
    description: 'Lock SOL or SKR collateral into on-chain escrow and receive instant liquidity.',
  },
  {
    id: 'social_grace',
    icon: 'shield-checkmark',
    title: '24-Hour Social Grace',
    description: 'Time-based micro-loans protect your position against market flash-crashes.',
  },
  {
    id: 'seed_vault',
    icon: 'hardware-chip',
    title: 'Seeker Seed Vault',
    description: 'Protected by Solana Mobile hardware security. Your private keys never leave the phone.',
  },
];

export const ConnectWalletView: React.FC<ConnectWalletViewProps> = ({ onConnected }) => {
  const { colors, mode, toggleTheme } = useTheme();
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  const handleMwaConnect = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setIsConnecting(true);
    try {
      const session = await connectSeekerWallet();
      onConnected(session);
    } catch (err: any) {
      console.log('MWA Connection error:', err);
      Alert.alert(
        'Seeker Hardware Wallet',
        err?.message || 'Could not connect to Seeker Seed Vault. Please ensure your device is unlocked and authorized to proceed.'
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleNextSlide = () => {
    try { Haptics.selectionAsync(); } catch {}
    setActiveSlide((prev) => (prev + 1) % ONBOARDING_SLIDES.length);
  };

  const slide = ONBOARDING_SLIDES[activeSlide];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Top Utility Row ── */}
      <View style={styles.topBar}>
        <View style={[styles.networkBadge, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
          <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.networkText, { color: colors.primaryLabel }]}>Solana Mainnet</Text>
        </View>

        <TouchableOpacity
          style={[styles.themeBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          onPress={() => {
            try { Haptics.selectionAsync(); } catch {}
            toggleTheme();
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Toggle color theme"
        >
          <Ionicons
            name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'}
            size={18}
            color={colors.text}
          />
        </TouchableOpacity>
      </View>

      {/* ── Brand Lockup (Seeker & Nectar Style) ── */}
      <View style={styles.heroSection}>
        <View style={[styles.logoContainer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Image source={LOGO_IMG} style={styles.logoImage} resizeMode="contain" />
        </View>

        <Text style={[styles.brandTitle, { color: colors.text }]}>ClockLend</Text>
        <Text style={[styles.brandTagline, { color: colors.textSecondary }]}>
          Instant Credit on Solana Seeker
        </Text>
      </View>

      {/* ── Interactive Onboarding Carousel Card ── */}
      <TouchableOpacity
        style={[styles.carouselCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        onPress={handleNextSlide}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={`Onboarding feature ${activeSlide + 1} of ${ONBOARDING_SLIDES.length}. Tap to next.`}
      >
        <View style={[styles.carouselIconBox, { backgroundColor: colors.badgeBg }]}>
          <Ionicons name={slide.icon} size={28} color="#D97706" />
        </View>

        <Text style={[styles.carouselTitle, { color: colors.text }]}>{slide.title}</Text>
        <Text style={[styles.carouselDesc, { color: colors.textSecondary }]}>{slide.description}</Text>

        {/* Pagination Dots */}
        <View style={styles.dotsRow}>
          {ONBOARDING_SLIDES.map((s, idx) => (
            <TouchableOpacity
              key={s.id}
              style={[
                styles.dot,
                { backgroundColor: idx === activeSlide ? '#D97706' : colors.cardBorder },
                idx === activeSlide && styles.activeDot,
              ]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setActiveSlide(idx);
              }}
            />
          ))}
        </View>
      </TouchableOpacity>

      {/* ── Bottom Action ── */}
      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={[
            styles.connectBtn,
            { backgroundColor: colors.primary },
            isConnecting && styles.btnDisabled,
          ]}
          onPress={handleMwaConnect}
          disabled={isConnecting}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Connect Seeker Hardware Wallet"
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color={colors.primaryText} />
          ) : (
            <>
              <Ionicons name="wallet-outline" size={20} color={colors.primaryText} />
              <Text style={[styles.connectBtnText, { color: colors.primaryText }]}>
                Connect Seeker Wallet
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.secureFooter}>
          <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
          <Text style={[styles.secureFooterText, { color: colors.textMuted }]}>
            Protected by Solana Mobile Seed Vault
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  networkText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  themeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  logoImage: {
    width: 44,
    height: 44,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  brandTagline: {
    fontSize: 14,
    fontWeight: '600',
  },
  carouselCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  carouselIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  carouselTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  carouselDesc: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
    marginBottom: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    width: 24,
    borderRadius: 4,
  },
  bottomSection: {
    gap: 12,
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 28,
    gap: 10,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  connectBtnText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  secureFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 4,
  },
  secureFooterText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
