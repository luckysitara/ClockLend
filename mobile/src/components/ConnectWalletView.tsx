import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { connectSeekerWallet, SeekerSession } from '../solana/seekerWallet';

const LOGO_IMG = require('../../assets/logo.png');

interface ConnectWalletViewProps {
  onConnected: (session: SeekerSession) => void;
}

interface OnboardingSlide {
  id: string;
  badge: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: 'instant_borrow',
    badge: 'INSTANT LIQUIDITY',
    icon: 'flash',
    title: 'Instant USDC Borrow',
    description: 'Lock SOL or SKR collateral into trustless on-chain escrow and receive instant liquidity.',
  },
  {
    id: 'social_grace',
    badge: 'ZERO LIQUIDATION CLIFF',
    icon: 'shield-checkmark',
    title: '24-Hour Social Grace',
    description: 'Time-based micro-loans protect your position against market flash-crashes and sudden price wicks.',
  },
  {
    id: 'seed_vault',
    badge: 'HARDWARE SECURITY',
    icon: 'hardware-chip',
    title: 'Seeker Seed Vault',
    description: 'Protected by Solana Mobile hardware security. Private keys never leave your physical device.',
  },
];

export const ConnectWalletView: React.FC<ConnectWalletViewProps> = ({ onConnected }) => {
  const { colors, mode, toggleTheme } = useTheme();
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  // Animations for auto-switching card
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Auto-rotate slides every 3.5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      // Animate out
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -8,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setActiveSlide((prev) => (prev + 1) % ONBOARDING_SLIDES.length);
        slideAnim.setValue(8);
        // Animate in
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }, 3800);

    return () => clearInterval(timer);
  }, []);

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

      {/* ── Brand Lockup (Electric Cyan Logo & Typography) ── */}
      <View style={styles.heroSection}>
        <View style={[styles.logoContainer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Image source={LOGO_IMG} style={styles.logoImage} resizeMode="contain" />
        </View>

        <Text style={[styles.brandTitle, { color: colors.text }]}>ClockLend</Text>
        <Text style={[styles.brandTagline, { color: colors.textSecondary }]}>
          Next-Gen Credit Protocol on Solana
        </Text>
      </View>

      {/* ── Sleek Auto-Rotating Feature Showcase Card ── */}
      <View style={[styles.cardWrapper, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Animated.View
          style={[
            styles.cardInner,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={[styles.badgePill, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
            <Text style={[styles.badgeText, { color: colors.primaryLabel }]}>{slide.badge}</Text>
          </View>

          <View style={[styles.iconBox, { backgroundColor: colors.badgeBg }]}>
            <Ionicons name={slide.icon} size={30} color={colors.primary} />
          </View>

          <Text style={[styles.cardTitle, { color: colors.text }]}>{slide.title}</Text>
          <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{slide.description}</Text>
        </Animated.View>

        {/* Carousel Indicator Dots */}
        <View style={styles.dotsRow}>
          {ONBOARDING_SLIDES.map((s, idx) => (
            <View
              key={s.id}
              style={[
                styles.dot,
                { backgroundColor: idx === activeSlide ? colors.primary : colors.cardBorder },
                idx === activeSlide && styles.activeDot,
              ]}
            />
          ))}
        </View>
      </View>

      {/* ── Bottom Action ── */}
      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={[styles.connectBtnContainer, isConnecting && styles.btnDisabled]}
          onPress={handleMwaConnect}
          disabled={isConnecting}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Connect Seeker Hardware Wallet"
        >
          <LinearGradient
            colors={mode === 'dark' ? ['#172554', '#1E40AF', '#2563EB'] : ['#1E3A8A', '#1D4ED8', '#2563EB']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.connectBtnGradient}
          >
            {isConnecting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="wallet-outline" size={20} color="#FFFFFF" />
                <Text style={styles.connectBtnText}>Connect Seeker Wallet</Text>
              </>
            )}
          </LinearGradient>
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
    paddingVertical: 8,
  },
  logoContainer: {
    width: 76,
    height: 76,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
  },
  logoImage: {
    width: 48,
    height: 48,
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
  cardWrapper: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 3,
  },
  cardInner: {
    alignItems: 'center',
    width: '100%',
  },
  badgePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  iconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  cardDesc: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 12,
    marginBottom: 18,
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
    width: 22,
    borderRadius: 4,
  },
  bottomSection: {
    gap: 12,
  },
  connectBtnContainer: {
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 5,
  },
  connectBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    gap: 10,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  connectBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
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
