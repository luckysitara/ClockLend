import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { connectSeekerWallet, SeekerSession } from '../solana/seekerWallet';
import { fetchLivePools, calculateExactInterestDue } from '../solana/onChainService';

const LOGO_IMG = require('../../assets/logo.png');
const { width } = Dimensions.get('window');
const SLIDE_WIDTH = width - 48;

interface ConnectWalletViewProps {
  onConnected: (session: SeekerSession) => void;
}

interface OnboardingSlide {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  badge: string;
  title: string;
  description: string;
  chips: string[];
}

const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: '1',
    icon: 'flash-outline',
    iconColor: '#6366F1',
    badge: '1-TAP MICRO-CREDIT',
    title: 'Micro-Credit in Seconds',
    description: 'Draw instant USDC against your SOL or SKR at up to 70% LTV. Zero paperwork, atomic on-chain settlement.',
    chips: ['⚡ Instant Settlement', '📈 Up to 70% LTV', '🪙 Real USDC'],
  },
  {
    id: '2',
    icon: 'shield-outline',
    iconColor: '#10B981',
    badge: 'ZERO INSTANT LIQUIDATION',
    title: '24-Hour Social Grace',
    description: 'Borrow with peace of mind. ClockLend never runs an instant auction: a 24-hour grace window must be opened on-chain at or after your due date before any collateral can be claimed.',
    chips: ['🛡️ 24h Grace Shield', '🤝 Peer-Funded Desks', '🚫 No Instant Liquidation'],
  },
  {
    id: '3',
    icon: 'hardware-chip-outline',
    iconColor: '#38BDF8',
    badge: 'SEEKER ENCLAVE',
    title: 'Hardware Seed Vault',
    description: 'Private keys remain permanently sealed within your Seeker SPU hardware enclave. 100% non-custodial.',
    chips: ['🔐 SPU Hardware Enclave', '📱 Solana Seeker Native', '🔒 100% Non-Custodial'],
  },
  {
    id: '4',
    icon: 'calculator-outline',
    iconColor: '#F59E0B',
    badge: 'TRY BEFORE YOU CONNECT',
    title: 'Preview Your Borrow',
    description: 'Simulate a loan at the live mainnet pool rate. No wallet needed — just tap.',
    chips: [],
  },
];

const CALC_PRESET_AMOUNTS = [10, 25, 50, 100];
const CALC_PRESET_TERMS = [7, 14, 30];

export const ConnectWalletView: React.FC<ConnectWalletViewProps> = ({ onConnected }) => {
  const { colors, mode, toggleTheme } = useTheme();
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const flatListRef = useRef<FlatList<OnboardingSlide>>(null);

  // Pre-auth borrow calculator: live mainnet pool rate, exact on-chain interest math.
  const [calcAmount, setCalcAmount] = useState(25);
  const [calcDays, setCalcDays] = useState(14);
  const [liveRateBps, setLiveRateBps] = useState<number | null>(null);
  const [rateStatus, setRateStatus] = useState<'loading' | 'live' | 'unavailable'>('loading');

  useEffect(() => {
    let cancelled = false;
    fetchLivePools('mainnet-beta')
      .then((pools) => {
        if (cancelled) return;
        const pool = pools.find((p) => p.totalLiquidity > 0) ?? pools[0];
        if (pool) {
          setLiveRateBps(pool.interestRateBps);
          setRateStatus('live');
        } else {
          setRateStatus('unavailable');
        }
      })
      .catch(() => {
        if (!cancelled) setRateStatus('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const calcInterestMicro =
    rateStatus === 'live' && liveRateBps !== null
      ? calculateExactInterestDue(
          BigInt(calcAmount) * 1_000_000n,
          liveRateBps,
          calcDays * 86400
        )
      : null;
  const calcInterestUsd = calcInterestMicro === null ? null : Number(calcInterestMicro) / 1e6;
  const calcRepayUsd = calcInterestUsd === null ? null : calcAmount + calcInterestUsd;

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

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollOffset / SLIDE_WIDTH);
    if (index !== activeSlide && index >= 0 && index < ONBOARDING_SLIDES.length) {
      setActiveSlide(index);
    }
  };

  const goToSlide = (index: number) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setActiveSlide(index);
    flatListRef.current?.scrollToIndex({ index, animated: true });
  };

  const renderSlide = ({ item }: { item: OnboardingSlide }) => {
    return (
      <View style={[styles.slideContainer, { width: SLIDE_WIDTH }]}>
        <View style={[styles.iconWrapper, { backgroundColor: `${item.iconColor}15` }]}>
          <Ionicons name={item.icon} size={36} color={item.iconColor} />
        </View>

        <View style={[styles.slideBadge, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
          <Text style={[styles.slideBadgeText, { color: colors.primary }]}>{item.badge}</Text>
        </View>

        <Text style={[styles.slideTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.slideDesc, { color: colors.textSecondary }]}>{item.description}</Text>

        {item.id === '4' ? (
          <View style={[styles.calcCard, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Text style={[styles.calcSectionLabel, { color: colors.textMuted }]}>BORROW AMOUNT</Text>
            <View style={styles.calcRow}>
              {CALC_PRESET_AMOUNTS.map((amt) => {
                const isActive = calcAmount === amt;
                return (
                  <TouchableOpacity
                    key={amt}
                    activeOpacity={0.7}
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      setCalcAmount(amt);
                    }}
                    style={[
                      styles.calcChip,
                      isActive
                        ? { backgroundColor: colors.primary, borderColor: colors.primary }
                        : { backgroundColor: colors.card, borderColor: colors.cardBorder },
                    ]}
                  >
                    <Text style={[styles.calcChipText, { color: isActive ? colors.primaryText : colors.textSecondary }]}>
                      ${amt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.calcSectionLabel, { color: colors.textMuted }]}>LOAN TERM</Text>
            <View style={styles.calcRow}>
              {CALC_PRESET_TERMS.map((days) => {
                const isActive = calcDays === days;
                return (
                  <TouchableOpacity
                    key={days}
                    activeOpacity={0.7}
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      setCalcDays(days);
                    }}
                    style={[
                      styles.calcChip,
                      isActive
                        ? { backgroundColor: colors.primary, borderColor: colors.primary }
                        : { backgroundColor: colors.card, borderColor: colors.cardBorder },
                    ]}
                  >
                    <Text style={[styles.calcChipText, { color: isActive ? colors.primaryText : colors.textSecondary }]}>
                      {days}d
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.calcDivider, { backgroundColor: colors.divider }]} />

            {rateStatus === 'live' && calcInterestUsd !== null && calcRepayUsd !== null ? (
              <>
                <Text style={[styles.calcEstimateLabel, { color: colors.textMuted }]}>
                  AT {(liveRateBps! / 100).toFixed(2)}% APR — LIVE MAINNET RATE
                </Text>
                <Text style={[styles.calcEstimateValue, { color: colors.text }]}>
                  Repay ${calcRepayUsd.toFixed(2)} <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>in {calcDays} days</Text>
                </Text>
                <Text style={[styles.calcNote, { color: colors.textMuted }]}>
                  Interest ${calcInterestUsd.toFixed(2)} · up to 50% lower with 1,000+ SKR staked
                </Text>
              </>
            ) : (
              <Text style={[styles.calcNote, { color: colors.textMuted }]}>
                {rateStatus === 'loading'
                  ? 'Fetching live mainnet rate…'
                  : 'Live rate unavailable — connect to see your exact offer.'}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.slideChipsRow}>
            {item.chips.map((chip, idx) => (
              <View
                key={idx}
                style={[
                  styles.slideChip,
                  { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder },
                ]}
              >
                <Text style={[styles.slideChipText, { color: colors.textSecondary }]}>{chip}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <Image source={LOGO_IMG} style={styles.miniLogo} resizeMode="contain" />
          <Text style={[styles.brandText, { color: colors.text }]}>ClockLend</Text>
          <View style={styles.mainnetDot} />
        </View>

        <TouchableOpacity
          style={[styles.themePill, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          onPress={toggleTheme}
          activeOpacity={0.7}
        >
          <Ionicons
            name={mode === 'light' ? 'moon-outline' : 'sunny-outline'}
            size={14}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Main Onboarding Guide Carousel */}
      <View style={styles.carouselContainer}>
        <FlatList
          ref={flatListRef}
          data={ONBOARDING_SLIDES}
          renderItem={renderSlide}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          bounces={false}
          contentContainerStyle={styles.flatListContent}
        />

        {/* Carousel Pagination Dots */}
        <View style={styles.paginationRow}>
          {ONBOARDING_SLIDES.map((_, idx) => {
            const isActive = activeSlide === idx;
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => goToSlide(idx)}
                style={[
                  styles.dot,
                  isActive
                    ? [styles.activeDot, { backgroundColor: colors.primary }]
                    : [styles.inactiveDot, { backgroundColor: colors.cardBorder }],
                ]}
              />
            );
          })}
        </View>
      </View>

      {/* Bottom Action Area */}
      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={styles.connectTouchable}
          onPress={handleMwaConnect}
          disabled={isConnecting}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#6366F1', '#4F46E5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.connectGradient}
          >
            {isConnecting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <View style={styles.connectBtnContent}>
                <Ionicons name="wallet-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.connectBtnText}>Connect Seeker Wallet</Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.securityNoteRow}>
          <Ionicons name="shield-checkmark" size={12} color="#10B981" style={{ marginRight: 6 }} />
          <Text style={[styles.securityNoteText, { color: colors.textMuted }]}>
            Protected by Solana Seeker Seed Vault
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 36,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniLogo: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  brandText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  mainnetDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginLeft: 2,
  },
  themePill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
  },
  flatListContent: {
    alignItems: 'center',
  },
  slideContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  iconWrapper: {
    width: 76,
    height: 76,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  slideBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  slideBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  slideTitle: {
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  slideDesc: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
  },
  slideChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
  },
  slideChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  slideChipText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  calcCard: {
    width: '100%',
    maxWidth: 320,
    marginTop: 20,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  calcSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  calcRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  calcChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calcChipText: {
    fontSize: 13,
    fontWeight: '800',
  },
  calcDivider: {
    height: 1,
    marginBottom: 12,
  },
  calcEstimateLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  calcEstimateValue: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  calcNote: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 16,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 28,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  activeDot: {
    width: 22,
  },
  inactiveDot: {
    width: 6,
  },
  actionContainer: {
    paddingTop: 12,
  },
  connectTouchable: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
  },
  connectGradient: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  securityNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityNoteText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
