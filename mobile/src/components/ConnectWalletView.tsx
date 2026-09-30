import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { connectSeekerWallet, SeekerSession } from '../solana/seekerWallet';

const LOGO_IMG = require('../../assets/logo.png');

interface ConnectWalletViewProps {
  onConnected: (session: SeekerSession) => void;
}

export const ConnectWalletView: React.FC<ConnectWalletViewProps> = ({ onConnected }) => {
  const { colors, mode, toggleTheme } = useTheme();
  const [isConnecting, setIsConnecting] = useState(false);

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Top Utility Bar */}
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

      {/* Hero Brand Section */}
      <View style={styles.heroSection}>
        <View style={[styles.logoContainer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Image source={LOGO_IMG} style={styles.logoImage} resizeMode="contain" />
        </View>

        <Text style={[styles.brandTitle, { color: colors.text }]}>ClockLend</Text>
        <Text style={[styles.brandTagline, { color: colors.textSecondary }]}>
          Instant Liquidity on Solana
        </Text>
        <Text style={[styles.brandDescription, { color: colors.textMuted }]}>
          Borrow USDC against your SOL and SKR with zero instant liquidation risk.
        </Text>
      </View>

      {/* 3 Core Value Props (Jupiter/Solflare Style) */}
      <View style={styles.featuresContainer}>
        <View style={[styles.featureCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={[styles.featureIconBox, { backgroundColor: colors.badgeBg }]}>
            <Ionicons name="flash" size={20} color={colors.primary} />
          </View>
          <View style={styles.featureContent}>
            <Text style={[styles.featureTitle, { color: colors.text }]}>Instant USDC Borrow</Text>
            <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>
              Lock collateral into trustless on-chain escrow and receive instant liquidity.
            </Text>
          </View>
        </View>

        <View style={[styles.featureCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={[styles.featureIconBox, { backgroundColor: 'rgba(52, 211, 153, 0.12)' }]}>
            <Ionicons name="shield-checkmark" size={20} color={colors.success} />
          </View>
          <View style={styles.featureContent}>
            <Text style={[styles.featureTitle, { color: colors.text }]}>24-Hour Social Grace</Text>
            <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>
              Time-based loans protect your position against market flash crashes.
            </Text>
          </View>
        </View>

        <View style={[styles.featureCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={[styles.featureIconBox, { backgroundColor: 'rgba(56, 189, 248, 0.12)' }]}>
            <Ionicons name="hardware-chip" size={20} color={colors.accent} />
          </View>
          <View style={styles.featureContent}>
            <Text style={[styles.featureTitle, { color: colors.text }]}>Seeker Seed Vault</Text>
            <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>
              Protected by Solana Mobile hardware security. Your keys stay on device.
            </Text>
          </View>
        </View>
      </View>

      {/* Bottom Connect CTA */}
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
            Secured by Solana Mobile Stack (MWA)
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 8,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  networkText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  themeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  logoImage: {
    width: 48,
    height: 48,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  brandTagline: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  brandDescription: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 16,
  },
  featuresContainer: {
    gap: 10,
    marginVertical: 12,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  featureIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  bottomSection: {
    paddingBottom: 24,
    paddingTop: 8,
    alignItems: 'center',
  },
  connectBtn: {
    width: '100%',
    height: 56,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  connectBtnText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secureFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  secureFooterText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
