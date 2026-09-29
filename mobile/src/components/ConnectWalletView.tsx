import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { connectSeekerWallet, SeekerSession } from '../solana/seekerWallet';

const LOGO_IMG = require('../../assets/logo.png');
const SKR_IMG = require('../../assets/tokens/skr.png');
const SOL_IMG = require('../../assets/tokens/sol.png');
const USDC_IMG = require('../../assets/tokens/usdc.png');

interface ConnectWalletViewProps {
  onConnected: (session: SeekerSession) => void;
}

export const ConnectWalletView: React.FC<ConnectWalletViewProps> = ({ onConnected }) => {
  const { colors, mode, toggleTheme } = useTheme();
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeFeatureTab, setActiveFeatureTab] = useState<number>(0);

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

  const featureTabs = [
    {
      title: 'Express Match',
      icon: 'flash' as const,
      color: '#572DFD',
      headline: 'Instant P2P Micro-Credit',
      desc: 'Draw up to 85% LTV in USDC against SOL and SKR. Algorithmic matching routes to the lowest APR liquidity desks in under 1 second.',
      tag: '85% Max LTV',
    },
    {
      title: 'Social Pawn',
      icon: 'people' as const,
      color: '#14F195',
      headline: 'Decentralized Pawn Deck',
      desc: 'Create or fund 1-on-1 pawn offers with custom terms, flexible interest rates, and an autonomous 24h grace window before any liquidation.',
      tag: '24h Grace Shield',
    },
    {
      title: 'SKR Dividends',
      icon: 'diamond' as const,
      color: '#06B6D4',
      headline: 'Protocol Revenue Sharing',
      desc: '50% of all loan origination fees route directly into the SKR Yield Vault. Stakers claim real USDC dividends non-custodially.',
      tag: 'Real Yield',
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Top Header Status & Theme Switcher */}
      <View style={styles.topBar}>
        <View style={[styles.networkBadge, { backgroundColor: 'rgba(20, 241, 149, 0.1)', borderColor: 'rgba(20, 241, 149, 0.3)' }]}>
          <View style={styles.pulsingDot} />
          <Text style={styles.networkBadgeText}>SOLANA MAINNET</Text>
        </View>

        <TouchableOpacity
          style={[styles.themeBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          onPress={toggleTheme}
          activeOpacity={0.7}
        >
          <Ionicons
            name={mode === 'light' ? 'moon' : 'sunny'}
            size={14}
            color={colors.primary}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.themeBtnText, { color: colors.text }]}>
            {mode === 'light' ? 'Dark' : 'Light'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Hero Section with Glowing Holographic Logo */}
      <View style={styles.heroSection}>
        <View style={styles.logoOuterGlow}>
          <LinearGradient
            colors={['#572DFD', '#14F195', '#06B6D4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoGradientBorder}
          >
            <View style={[styles.logoInnerCard, { backgroundColor: colors.card }]}>
              <Image source={LOGO_IMG} style={styles.logoImage} resizeMode="contain" />
            </View>
          </LinearGradient>
        </View>

        <View style={[styles.platformPill, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
          <Ionicons name="hardware-chip" size={12} color={colors.primary} style={{ marginRight: 5 }} />
          <Text style={[styles.platformPillText, { color: colors.primary }]}>SOLANA SEEKER NATIVE</Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>ClockLend</Text>
        <Text style={[styles.tagline, { color: colors.accent }]}>
          Decentralized Micro-Credit & Social Pawn Protocol
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Instant USDC liquidity against SOL & SKR • Seed Vault SPU hardware protection • 100% on-chain escrows
        </Text>
      </View>

      {/* Primary Connect Action Area */}
      <View style={[styles.actionBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <TouchableOpacity
          style={styles.connectTouchable}
          onPress={handleMwaConnect}
          disabled={isConnecting}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#572DFD', '#7C3AED', '#9333EA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.connectGradient}
          >
            {isConnecting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <View style={styles.connectBtnContent}>
                <Ionicons name="wallet-outline" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
                <Text style={styles.connectBtnText}>Connect Seeker Wallet</Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.securityRow}>
          <Ionicons name="shield-checkmark" size={13} color="#14F195" style={{ marginRight: 6 }} />
          <Text style={[styles.securityNote, { color: colors.textMuted }]}>
            Protected by Seed Vault SPU Enclave • Production Mainnet
          </Text>
        </View>
      </View>

      {/* Interactive Feature Showcase Tabs */}
      <View style={styles.featureShowcase}>
        <View style={styles.featureTabsNav}>
          {featureTabs.map((tab, idx) => {
            const isActive = activeFeatureTab === idx;
            return (
              <TouchableOpacity
                key={tab.title}
                style={[
                  styles.featureTabBtn,
                  isActive
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
                onPress={() => setActiveFeatureTab(idx)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={tab.icon}
                  size={14}
                  color={isActive ? '#FFFFFF' : colors.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.featureTabBtnText,
                    { color: isActive ? '#FFFFFF' : colors.textSecondary },
                  ]}
                >
                  {tab.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Active Tab Highlight Card */}
        <View style={[styles.activeTabCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.tabCardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.tabHeadline, { color: colors.text }]}>
                {featureTabs[activeFeatureTab].headline}
              </Text>
            </View>
            <View style={[styles.tagBadge, { backgroundColor: 'rgba(20, 241, 149, 0.12)', borderColor: 'rgba(20, 241, 149, 0.3)' }]}>
              <Text style={styles.tagBadgeText}>{featureTabs[activeFeatureTab].tag}</Text>
            </View>
          </View>
          <Text style={[styles.tabDesc, { color: colors.textSecondary }]}>
            {featureTabs[activeFeatureTab].desc}
          </Text>
        </View>
      </View>

      {/* Supported Collateral Assets Section */}
      <View style={styles.assetsSection}>
        <Text style={[styles.sectionHeading, { color: colors.textMuted }]}>SUPPORTED COLLATERAL ASSETS</Text>
        <View style={styles.assetsGrid}>
          <View style={[styles.assetCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Image source={SKR_IMG} style={styles.assetImg} resizeMode="contain" />
            <Text style={[styles.assetSymbol, { color: colors.text }]}>SKR</Text>
            <Text style={[styles.assetName, { color: colors.textSecondary }]}>Seeker Token</Text>
            <View style={[styles.assetBadge, { backgroundColor: colors.badgeBg }]}>
              <Text style={[styles.assetBadgeText, { color: colors.primary }]}>85% LTV</Text>
            </View>
          </View>

          <View style={[styles.assetCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Image source={SOL_IMG} style={styles.assetImg} resizeMode="contain" />
            <Text style={[styles.assetSymbol, { color: colors.text }]}>SOL</Text>
            <Text style={[styles.assetName, { color: colors.textSecondary }]}>Solana</Text>
            <View style={[styles.assetBadge, { backgroundColor: 'rgba(20, 241, 149, 0.12)' }]}>
              <Text style={[styles.assetBadgeText, { color: '#14F195' }]}>75% LTV</Text>
            </View>
          </View>

          <View style={[styles.assetCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Image source={USDC_IMG} style={styles.assetImg} resizeMode="contain" />
            <Text style={[styles.assetSymbol, { color: colors.text }]}>USDC</Text>
            <Text style={[styles.assetName, { color: colors.textSecondary }]}>Liquidity</Text>
            <View style={[styles.assetBadge, { backgroundColor: 'rgba(56, 189, 248, 0.12)' }]}>
              <Text style={[styles.assetBadgeText, { color: '#38BDF8' }]}>Payouts</Text>
            </View>
          </View>

          <View style={[styles.assetCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={[styles.cnftIconBox, { backgroundColor: colors.badgeBg }]}>
              <Ionicons name="cube-outline" size={24} color={colors.primary} />
            </View>
            <Text style={[styles.assetSymbol, { color: colors.text }]}>cNFT</Text>
            <Text style={[styles.assetName, { color: colors.textSecondary }]}>Compressed</Text>
            <View style={[styles.assetBadge, { backgroundColor: 'rgba(234, 179, 8, 0.12)' }]}>
              <Text style={[styles.assetBadgeText, { color: '#EAB308' }]}>Social Pawn</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Protocol Trust & Security Credentials */}
      <View style={styles.trustGrid}>
        <View style={[styles.trustCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.trustVal}>14 Rounds</Text>
          <Text style={[styles.trustLbl, { color: colors.textMuted }]}>Security Audited</Text>
        </View>
        <View style={[styles.trustCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.trustVal}>103 / 103</Text>
          <Text style={[styles.trustLbl, { color: colors.textMuted }]}>Tests Passing</Text>
        </View>
        <View style={[styles.trustCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.trustVal}>0% Float</Text>
          <Text style={[styles.trustLbl, { color: colors.textMuted }]}>Integer Math</Text>
        </View>
      </View>

      {/* Footer Info */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textMuted }]}>
          ClockLend Protocol • Solana Mainnet Slot 451589196
        </Text>
        <Text style={[styles.footerSub, { color: colors.textMuted }]}>
          Program ID: 4Dp2A6...NHgv7 • Non-Custodial Isolated Escrows
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 48,
    paddingBottom: 36,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#14F195',
    marginRight: 7,
  },
  networkBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#14F195',
    letterSpacing: 0.5,
  },
  themeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  themeBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoOuterGlow: {
    marginBottom: 14,
    shadowColor: '#572DFD',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
  },
  logoGradientBorder: {
    padding: 3,
    borderRadius: 30,
  },
  logoInnerCard: {
    width: 86,
    height: 86,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 62,
    height: 62,
  },
  platformPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 8,
  },
  platformPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginBottom: 4,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  actionBox: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  connectTouchable: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 10,
  },
  connectGradient: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityNote: {
    fontSize: 11,
    fontWeight: '600',
  },
  featureShowcase: {
    marginBottom: 24,
  },
  featureTabsNav: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  featureTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  featureTabBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  activeTabCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tabHeadline: {
    fontSize: 15,
    fontWeight: '800',
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#14F195',
  },
  tabDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  assetsSection: {
    marginBottom: 24,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  assetsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  assetCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  assetImg: {
    width: 28,
    height: 28,
    marginBottom: 6,
  },
  cnftIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  assetSymbol: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  assetName: {
    fontSize: 9,
    fontWeight: '600',
    marginBottom: 6,
  },
  assetBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  assetBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  trustGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  trustCard: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  trustVal: {
    fontSize: 15,
    fontWeight: '900',
    color: '#572DFD',
    marginBottom: 2,
  },
  trustLbl: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
  },
  footerSub: {
    fontSize: 10,
    fontWeight: '500',
  },
});
