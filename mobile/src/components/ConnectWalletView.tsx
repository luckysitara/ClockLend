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

/**
 * The four slides deliberately do NOT share one skeleton. Each one is a
 * different kind of page — a terms ledger, a timeline, a plain statement, then
 * the calculator — because four copies of badge/title/paragraph/chips is what
 * made this screen read as filler.
 *
 * Every figure quoted in `ONBOARDING_SLIDES` is enforced by the program:
 *   LTV cap 7000 bps            processor.rs `MAX_LTV_BPS` / `process_initialize_pool`
 *   origination 25 / 50 bps     `originationFeeBps` (SOL / SKR collateral), withheld from principal
 *   simple interest, 365-day yr principal × rate × secs / (10_000 × 31_536_000)
 *   grace window 86400 s        `process_trigger_grace_period` — opened by instruction, never automatic
 *   oracle age bound 600 s      `ADMIN_FEED_MAX_PRICE_AGE_SECS`
 *   SKR discounts 25% / 50%     interest rate only; it never changes LTV
 * Do not add a number here that you cannot point at in the source.
 */
type OnboardingSlide =
  | {
      id: string;
      variant: 'terms';
      kicker: string;
      title: string;
      body: string;
      facts: { label: string; value: string; detail: string }[];
    }
  | {
      id: string;
      variant: 'timeline';
      kicker: string;
      title: string;
      steps: { label: string; detail: string }[];
      note: string;
    }
  | {
      id: string;
      variant: 'statement';
      kicker: string;
      statement: string;
      body: string;
      caveatTitle: string;
      caveats: string[];
    }
  | { id: string; variant: 'calculator'; kicker: string; title: string };

const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: '1',
    variant: 'terms',
    kicker: 'THE LOAN',
    title: 'USDC against your SOL or SKR',
    body: 'Post collateral to a program-owned escrow and receive USDC. Repay principal plus interest by the due date to get it back.',
    facts: [
      {
        label: 'LTV cap',
        value: '7000 bps (70%)',
        detail: 'Fixed per pool at creation; new pools cannot exceed it.',
      },
      {
        label: 'Origination fee',
        value: '0.25% SOL / 0.50% SKR',
        detail: 'Withheld up front, not added to your repayment.',
      },
      {
        label: 'Interest',
        value: 'Simple, over a 365-day year',
        detail: 'The program accepts no partial repayment.',
      },
    ],
  },
  {
    id: '2',
    variant: 'timeline',
    kicker: 'IF YOU RUN LATE',
    title: 'The 24-hour grace window',
    steps: [
      { label: 'Due date', detail: 'Repayment is due in full.' },
      {
        label: 'Window opened',
        detail: 'You or the desk submit the on-chain instruction that starts a 24-hour window. It is not automatic.',
      },
      {
        label: 'Claim possible',
        detail: 'Only once the window has expired can the escrowed collateral be claimed.',
      },
    ],
    note: 'While the window is open, the program rejects any claim against your escrow.',
  },
  {
    id: '3',
    variant: 'statement',
    kicker: 'BEFORE YOU CONNECT',
    statement: 'Your key stays in the Seeker Seed Vault.',
    body: 'Signing happens on the device. This app holds no key material and cannot move your funds on its own.',
    caveatTitle: 'WHAT THIS DOES NOT CLAIM',
    caveats: [
      'Staking SKR discounts the interest rate only — 25% off at 100 SKR, 50% at 1,000 SKR. It never raises your LTV.',
      'No insurance, no principal protection, no guaranteed return.',
      'The program is upgradeable by its authority key; prices are admin-fed and rejected past 600 seconds.',
    ],
  },
  {
    id: '4',
    variant: 'calculator',
    kicker: 'NO WALLET NEEDED',
    title: 'What would you repay?',
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

  const renderAmountPicker = () => (
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
  );

  const renderTermPicker = () => (
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
  );

  const renderSlide = ({ item }: { item: OnboardingSlide }) => {
    return (
      <View style={[styles.slideContainer, { width: SLIDE_WIDTH }]}>
        <View style={styles.slideColumn}>
          {item.variant === 'terms' && (
            <>
              <Text style={[styles.kicker, { color: colors.textMuted }]}>{item.kicker}</Text>
              <Text style={[styles.displayTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.lead, { color: colors.textSecondary }]}>{item.body}</Text>

              <View style={styles.factList}>
                {item.facts.map((fact, idx) => (
                  <View
                    key={fact.label}
                    style={[
                      styles.factRow,
                      idx > 0 && { borderTopWidth: 1, borderTopColor: colors.divider },
                    ]}
                  >
                    <View style={styles.factHead}>
                      <Text style={[styles.factLabel, { color: colors.textSecondary }]}>{fact.label}</Text>
                      <View style={[styles.factLeader, { backgroundColor: colors.divider }]} />
                      <Text style={[styles.factValue, { color: colors.text }]}>{fact.value}</Text>
                    </View>
                    <Text style={[styles.factDetail, { color: colors.textMuted }]}>{fact.detail}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {item.variant === 'timeline' && (
            <>
              <Text style={[styles.kicker, { color: colors.textMuted }]}>{item.kicker}</Text>
              <Text style={[styles.displayTitle, { color: colors.text }]}>{item.title}</Text>

              <View style={styles.timeline}>
                {item.steps.map((step, idx) => {
                  const isLast = idx === item.steps.length - 1;
                  return (
                    <View key={step.label} style={styles.stepRow}>
                      <View style={styles.stepRail}>
                        <View
                          style={[
                            styles.stepDot,
                            { backgroundColor: isLast ? colors.danger : colors.textMuted },
                          ]}
                        />
                        {!isLast && <View style={[styles.stepLine, { backgroundColor: colors.divider }]} />}
                      </View>
                      <View style={styles.stepBody}>
                        <Text style={[styles.stepLabel, { color: colors.text }]}>{step.label}</Text>
                        <Text style={[styles.stepDetail, { color: colors.textSecondary }]}>{step.detail}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              <Text style={[styles.note, { color: colors.textMuted }]}>{item.note}</Text>
            </>
          )}

          {item.variant === 'statement' && (
            <>
              <Text style={[styles.kicker, { color: colors.textMuted }]}>{item.kicker}</Text>
              <Text
                style={[styles.statement, { color: colors.text, borderLeftColor: colors.primary }]}
              >
                {item.statement}
              </Text>
              <Text style={[styles.lead, { color: colors.textSecondary }]}>{item.body}</Text>

              <Text style={[styles.kicker, styles.caveatTitle, { color: colors.textMuted }]}>
                {item.caveatTitle}
              </Text>
              {item.caveats.map((caveat) => (
                <View key={caveat} style={styles.caveatRow}>
                  <View style={[styles.caveatMark, { backgroundColor: colors.textMuted }]} />
                  <Text style={[styles.caveat, { color: colors.textSecondary }]}>{caveat}</Text>
                </View>
              ))}
            </>
          )}

          {item.variant === 'calculator' && (
            <>
              <Text style={[styles.kicker, { color: colors.textMuted }]}>{item.kicker}</Text>
              <Text style={[styles.calcTitle, { color: colors.text }]}>{item.title}</Text>

              <Text style={[styles.calcSectionLabel, { color: colors.textMuted }]}>BORROW AMOUNT</Text>
              {renderAmountPicker()}

              <Text style={[styles.calcSectionLabel, { color: colors.textMuted }]}>LOAN TERM</Text>
              {renderTermPicker()}

              <View style={[styles.calcDivider, { backgroundColor: colors.divider }]} />

              {rateStatus === 'live' && calcInterestUsd !== null && calcRepayUsd !== null ? (
                <>
                  <Text style={[styles.resultLabel, { color: colors.textMuted }]}>
                    REPAYMENT · {(liveRateBps! / 100).toFixed(2)}% APR, LIVE POOL RATE
                  </Text>
                  <Text style={[styles.resultValue, { color: colors.text }]}>
                    {`$${calcRepayUsd.toFixed(2)}`}
                  </Text>
                  <Text style={[styles.resultCaption, { color: colors.textSecondary }]}>
                    {`in ${calcDays} days · interest $${calcInterestUsd.toFixed(2)}`}
                  </Text>
                  <Text style={[styles.calcNote, { color: colors.textMuted }]}>
                    Estimate only. Collateral price movement and the origination fee withheld at disbursement
                    are not included.
                  </Text>
                </>
              ) : (
                <Text style={[styles.calcNote, { color: colors.textMuted }]}>
                  {rateStatus === 'loading'
                    ? 'Fetching the live mainnet pool rate…'
                    : 'Live rate unavailable — connect to see your own terms.'}
                </Text>
              )}
            </>
          )}
        </View>
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
          <View style={[styles.mainnetDot, { backgroundColor: colors.success }]} />
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

        <View style={styles.paginationRow}>
          <View style={styles.dotsRow}>
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

          {activeSlide < ONBOARDING_SLIDES.length - 1 && (
            <TouchableOpacity
              style={styles.nextButton}
              onPress={() => goToSlide(activeSlide + 1)}
              activeOpacity={0.6}
            >
              <Text style={[styles.nextText, { color: colors.primary }]}>Next</Text>
              <Ionicons name="chevron-forward" size={12} color={colors.primary} />
            </TouchableOpacity>
          )}
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
            colors={[colors.primary, '#4F46E5']}
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
          <Ionicons name="shield-checkmark" size={12} color={colors.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.securityNoteText, { color: colors.textMuted }]}>
            Signed in the Seeker Seed Vault
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
    paddingBottom: 30,
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
    marginVertical: 12,
  },
  flatListContent: {
    alignItems: 'center',
  },
  slideContainer: {
    justifyContent: 'center',
  },
  slideColumn: {
    width: '100%',
    maxWidth: 340,
  },
  // Type hierarchy, shared by the three editorial slides: a 10 px kicker, a
  // 28 px display line, 14 px secondary body, 11–12 px captions. Nothing here
  // is bigger than the slide's display line except the calculator's answer.
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  displayTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.7,
    lineHeight: 33,
    marginBottom: 10,
    maxWidth: 320,
  },
  lead: {
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 320,
  },
  // Slide 1 — terms ledger. Spacing plus a hairline leader rule instead of a card.
  factList: {
    width: '100%',
    marginTop: 16,
  },
  factRow: {
    paddingVertical: 9,
  },
  factHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  factLabel: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  factLeader: {
    flex: 1,
    height: 1,
    minWidth: 12,
    alignSelf: 'center',
  },
  factValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  factDetail: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3,
  },
  // Slide 2 — timeline.
  timeline: {
    width: '100%',
    marginTop: 14,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stepRail: {
    width: 10,
    alignItems: 'center',
    paddingTop: 4,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepLine: {
    width: 1,
    flex: 1,
    marginVertical: 3,
  },
  stepBody: {
    flex: 1,
    paddingBottom: 14,
    maxWidth: 300,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  stepDetail: {
    fontSize: 12,
    lineHeight: 17,
  },
  note: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
    maxWidth: 320,
  },
  // Slide 3 — statement with a rule, then the plain-terms list.
  statement: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 30,
    maxWidth: 300,
    borderLeftWidth: 3,
    paddingLeft: 12,
    marginBottom: 12,
  },
  caveatTitle: {
    marginTop: 20,
    marginBottom: 10,
  },
  caveatRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 9,
    maxWidth: 330,
  },
  caveatMark: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 7,
  },
  caveat: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  // Slide 4 — the calculator. Its answer is the largest thing on the screen.
  calcTitle: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 14,
    maxWidth: 300,
  },
  calcSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  calcRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  calcChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
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
    marginBottom: 14,
  },
  resultLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  resultValue: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  resultCaption: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  calcNote: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
    maxWidth: 330,
  },
  // Pagination — dots anchored to the same left edge as the slide copy.
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 22,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingLeft: 12,
  },
  nextText: {
    fontSize: 12,
    fontWeight: '700',
  },
  // Bottom action area — unchanged behaviour.
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
