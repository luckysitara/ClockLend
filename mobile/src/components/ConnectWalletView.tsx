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
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { connectSeekerWallet, SeekerSession } from '../solana/seekerWallet';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
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

  // Auto-rotate slides horizontally every 5.5 seconds (reduced speed)
  useEffect(() => {
    const timer = setInterval(() => {
      // Animate out horizontally to the left
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -30,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setActiveSlide((prev) => (prev + 1) % ONBOARDING_SLIDES.length);
        slideAnim.setValue(30);
        // Animate in horizontally from the right
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 350,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }, 5500);

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

      {/* ── Brand Logo Only (Clean Floating, No Box/Background) ── */}
      <View style={styles.heroSection}>
        <Image source={LOGO_IMG} style={styles.logoImage} resizeMode="contain" />
      </View>

      {/* ── Centered Bigger Showcase Card (Occupies 45-50% of Screen) ── */}
      <View style={styles.centerSection}>
        <View style={[styles.cardWrapper, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Animated.View
            style={[
              styles.cardInner,
              {
                opacity: fadeAnim,
                transform: [{ translateX: slideAnim }],
              },
            ]}
          >
            <View style={[styles.badgePill, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
              <Text style={[styles.badgeText, { color: colors.primaryLabel }]}>{slide.badge}</Text>
            </View>

            <View style={[styles.iconBox, { backgroundColor: colors.badgeBg }]}>
              <Ionicons name={slide.icon} size={32} color={colors.primary} />
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
      </View>

      {/* ── Bottom Action ── */}
      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={[styles.connectBtnContainer, isConnecting && styles.btnDisabled]}
          onPress={handleMwaConnect}
          disabled={isConnecting}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Connect Seeker Hardware Wallet"
        >
          <LinearGradient
            colors={mode === 'dark' ? ['#172554', '#1E40AF', '#2563EB'] : ['#1E3A8A', '#1D4ED8', '#2563EB']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.connectBtnGradient}
            pointerEvents="none"
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
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroSection: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  logoImage: {
    width: 68,
    height: 68,
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  cardWrapper: {
    minHeight: Math.round(SCREEN_HEIGHT * 0.38),
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  cardInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  badgePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  iconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  cardDesc: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeDot: {
    width: 18,
    borderRadius: 3,
  },
  bottomSection: {
    gap: 12,
    zIndex: 10,
    elevation: 5,
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
