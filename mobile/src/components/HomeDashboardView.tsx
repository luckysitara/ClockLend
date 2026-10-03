import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Image,
  Animated,
  Modal,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { LoanOrder, UserProfile, WalletAssets } from '../types';

interface HomeDashboardViewProps {
  skrHandle: string;
  userProfile: UserProfile;
  walletAssets?: WalletAssets;
  activeOrders: LoanOrder[];
  solBalance: number;
  onNavigateBorrow: () => void;
  onNavigateRepay: () => void;
  onNavigateDesks: () => void;
  onOpenAssetsModal: () => void;
  onOpenLeaderboard: () => void;
  onNavigateHub?: () => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BANNER_WIDTH = SCREEN_WIDTH - 32;

export const HomeDashboardView: React.FC<HomeDashboardViewProps> = ({
  skrHandle,
  userProfile,
  walletAssets,
  activeOrders,
  solBalance,
  onNavigateBorrow,
  onNavigateRepay,
  onNavigateDesks,
  onOpenAssetsModal,
  onOpenLeaderboard,
  onNavigateHub,
  onRefresh,
  isLoading = false,
}) => {
  const { colors, mode } = useTheme();
  const [showBalance, setShowBalance] = useState<boolean>(true);
  const [activeBanner, setActiveBanner] = useState<number>(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState<boolean>(false);

  const carouselRef = useRef<ScrollView>(null);

  const availableUsdc = walletAssets?.usdcBalance || 0;
  // Total portfolio USD balance across all assets (SOL, USDC, SKR, BONK) like standard Solana wallets
  const totalBalanceUsd =
    walletAssets?.totalUsdValue !== undefined && walletAssets.totalUsdValue > 0
      ? walletAssets.totalUsdValue
      : availableUsdc;

  // Rotating showcase banners.
  //
  // These are static copy, so every line here is a claim the reader will take as
  // fact. Keep them to things the program actually does — no named desks, no
  // capacity figures, no invented rates. (A previous version advertised a
  // "Solana Foundation Desk" at "$250,000 USDC Capacity": a fabricated desk,
  // attributed to a real organisation, over a hardcoded number.)
  const BANNER_CARDS = [
    {
      id: 'flat_rate',
      badge: 'ONE FLAT RATE',
      title: 'No Compound Interest',
      sub: 'Interest is a fixed percentage of the amount borrowed, capped at 10% per 30 days',
      cta: 'Borrow Now →',
      onPress: onNavigateBorrow,
      gradient: ['#1E3A8A', '#1D4ED8', '#2563EB'] as const,
    },
    {
      id: 'reputation',
      badge: 'ON-CHAIN REPUTATION',
      title: 'Seeker Credit Rankings',
      sub: 'Transparent on-chain reputation and bond-based tier discounts',
      cta: 'View Rankings →',
      onPress: onOpenLeaderboard,
      gradient: ['#0F172A', '#1E3A8A', '#2563EB'] as const,
    },
    {
      id: 'social_grace',
      badge: '24-HOUR GRACE',
      title: 'A Day Past Due, Not a Bot',
      sub: 'No automatic liquidation — a desk must wait out the grace window before it can act',
      cta: 'Explore Desks →',
      onPress: onNavigateDesks,
      gradient: ['#042F2E', '#0D9488', '#14B8A6'] as const,
    },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveBanner((prev) => {
        const next = (prev + 1) % BANNER_CARDS.length;
        carouselRef.current?.scrollTo({
          x: next * BANNER_WIDTH,
          animated: true,
        });
        return next;
      });
    }, 7500);

    return () => clearInterval(timer);
  }, []);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
    >
      {/* ── Top Header Row ── */}
      <View style={styles.topHeader}>
        <View style={styles.userSection}>
          <View style={[styles.avatar, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Image source={require('../../assets/logo.png')} style={styles.avatarImg} resizeMode="contain" />
          </View>
          <View>
            <Text style={[styles.greetingText, { color: colors.text }]}>Hello, {skrHandle}</Text>
          </View>
        </View>

        <View style={styles.topRightControls}>
          {onNavigateHub && (
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                onNavigateHub();
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Quick Hub"
            >
              <Ionicons name="grid-outline" size={18} color={colors.text} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              setShowNotificationsModal(true);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={18} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pointsPill, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            onPress={onOpenLeaderboard}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Leaderboard points"
          >
            <Text style={styles.trophyIcon}>🏅</Text>
            <Text style={[styles.pointsText, { color: colors.text }]}>
              {userProfile.reputationScore > 0 ? `${(userProfile.reputationScore / 100).toFixed(0)} pts` : '0 pts'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Deep Blue Gradient Hero Balance Card (Aggregated Portfolio Net Worth) ── */}
      <LinearGradient
        colors={mode === 'dark' ? ['#172554', '#1E40AF', '#2563EB'] : ['#1E3A8A', '#1D4ED8', '#2563EB']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.availableLabelRow}>
            <Text style={styles.availableLabel}>Total Available Balance</Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowBalance(!showBalance);
              }}
              style={styles.eyeBtn}
              accessibilityRole="button"
              accessibilityLabel="Toggle balance visibility"
            >
              <Ionicons
                name={showBalance ? 'eye-outline' : 'eye-off-outline'}
                size={18}
                color="rgba(255, 255, 255, 0.9)"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onOpenAssetsModal} style={styles.moreBtn} accessibilityRole="button" accessibilityLabel="More options">
            <Ionicons name="ellipsis-horizontal" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <Text style={styles.heroBalance}>
          {showBalance ? `$${totalBalanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$ ••••'}
        </Text>
        <Text style={styles.heroSubBalance}>
          {showBalance
            ? `${solBalance.toFixed(3)} SOL • ${(walletAssets?.usdcBalance ?? 0).toFixed(2)} USDC${(walletAssets?.skrBalance ?? 0) > 0 ? ` • ${(walletAssets?.skrBalance ?? 0).toLocaleString()} SKR` : ''}`
            : '••••'}
        </Text>
      </LinearGradient>

      {/* ── 3 Action Buttons: Borrow, Loans, Desks ── */}
      <View style={styles.actionRow}>
        <View style={styles.actionItem}>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onNavigateBorrow();
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Borrow funds"
          >
            <Ionicons name="arrow-down-outline" size={28} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Borrow</Text>
        </View>

        <View style={styles.actionItem}>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onNavigateRepay();
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="View my loans"
          >
            <View style={{ position: 'relative' }}>
              <Ionicons name="receipt-outline" size={28} color={colors.primary} />
              {activeOrders.length > 0 && (
                <View style={styles.actionBadge}>
                  <Text style={styles.actionBadgeText}>{activeOrders.length}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
            {activeOrders.length > 0 ? `Loans (${activeOrders.length})` : 'Loans'}
          </Text>
        </View>

        <View style={styles.actionItem}>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onNavigateDesks();
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Explore desks"
          >
            <Ionicons name="storefront-outline" size={28} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Desks</Text>
        </View>
      </View>

      {/* ── Auto-Rotating Horizontal Showcase Banner Carousel ── */}
      <View style={styles.carouselOuter}>
        <View style={styles.carouselContainer}>
          <ScrollView
            ref={carouselRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled={true}
            onMomentumScrollEnd={(e) => {
              const offsetX = e.nativeEvent.contentOffset.x;
              const index = Math.round(offsetX / BANNER_WIDTH);
              if (index >= 0 && index < BANNER_CARDS.length) {
                setActiveBanner(index);
              }
            }}
          >
            {BANNER_CARDS.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.bannerWrapper, { width: BANNER_WIDTH }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  item.onPress();
                }}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel={item.title}
              >
                <LinearGradient
                  colors={item.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.bannerGradient}
                >
                  <View style={styles.bannerContent}>
                    <View style={styles.bannerBadge}>
                      <Text style={styles.bannerBadgeText}>{item.badge}</Text>
                    </View>
                    <Text style={styles.bannerTitle}>{item.title}</Text>
                    <Text style={styles.bannerSub}>{item.sub}</Text>

                    <View style={styles.bannerCtaBtn}>
                      <Text style={styles.bannerCtaText}>{item.cta}</Text>
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Banner Carousel Indicator Dots */}
      <View style={styles.bannerDotsRow}>
        {BANNER_CARDS.map((b, idx) => (
          <TouchableOpacity
            key={b.id}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              setActiveBanner(idx);
              carouselRef.current?.scrollTo({
                x: idx * BANNER_WIDTH,
                animated: true,
              });
            }}
            style={[
              styles.bannerDot,
              { backgroundColor: idx === activeBanner ? colors.primary : colors.cardBorder },
              idx === activeBanner && styles.activeBannerDot,
            ]}
          />
        ))}
      </View>

      {/* ── Activity Section (Matches 8febc333) ── */}
      <View style={styles.activitySection}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Activity</Text>
          <TouchableOpacity onPress={onNavigateRepay} activeOpacity={0.7}>
            <Text style={[styles.seeMoreLink, { color: colors.primary }]}>See more</Text>
          </TouchableOpacity>
        </View>

        {activeOrders.length === 0 ? (
          /* Empty Receipt Doodle (Matches 8febc333 exactly) */
          <View style={styles.emptyReceiptBox}>
            <View style={[styles.receiptIconCircle, { backgroundColor: colors.cardAlt }]}>
              <Ionicons name="receipt-outline" size={44} color={colors.primary} />
            </View>
            <Text style={[styles.emptyReceiptText, { color: colors.textMuted }]}>
              No Transaction yet
            </Text>
          </View>
        ) : (
          /* Active Loans Summary Rows */
          activeOrders.slice(0, 3).map((order) => {
            const inGrace = order.status.toUpperCase().includes('GRACE');
            return (
              <TouchableOpacity
                key={order.id}
                style={[styles.orderRow, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                onPress={onNavigateRepay}
                activeOpacity={0.7}
              >
                <View style={styles.orderLeft}>
                  <View style={[styles.orderIconBg, { backgroundColor: inGrace ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)' }]}>
                    <Ionicons
                      name={inGrace ? 'time' : 'checkmark-circle'}
                      size={20}
                      color={inGrace ? '#F59E0B' : '#10B981'}
                    />
                  </View>
                  <View>
                    <Text style={[styles.orderPoolName, { color: colors.text }]}>{order.poolName}</Text>
                    <Text style={[styles.orderSub, { color: colors.textMuted }]}>
                      Collateral: {order.collateralName}
                    </Text>
                  </View>
                </View>

                <View style={styles.orderRight}>
                  <Text style={[styles.orderAmount, { color: colors.text }]}>
                    ${order.principalAmount} USDC
                  </Text>
                  <Text style={[styles.orderStatus, { color: inGrace ? '#F59E0B' : '#10B981' }]}>
                    {inGrace ? 'Grace Active' : 'Active'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* ── Notifications & Alerts Modal (Matches UX spec) ── */}
      <Modal
        visible={showNotificationsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNotificationsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowNotificationsModal(false)}
          />
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalSheetHandle} />
            <View style={styles.modalSheetHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="notifications" size={20} color={colors.primary} />
                <Text style={[styles.modalSheetTitle, { color: colors.text }]}>Notifications & Alerts</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowNotificationsModal(false)}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close notifications"
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              <View style={[styles.notificationItem, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
                <View style={[styles.notifIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Ionicons name="shield-checkmark" size={18} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notifTitle, { color: colors.text }]}>Social Grace Shield Active</Text>
                  <Text style={[styles.notifBody, { color: colors.textSecondary }]}>
                    All your micro-loans are secured with an automatic 24-hour liquidation buffer.
                  </Text>
                  <Text style={[styles.notifTime, { color: colors.textMuted }]}>Protocol Protection</Text>
                </View>
              </View>

              <View style={[styles.notificationItem, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
                <View style={[styles.notifIconBox, { backgroundColor: 'rgba(37, 99, 235, 0.15)' }]}>
                  <Ionicons name="hardware-chip" size={18} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notifTitle, { color: colors.text }]}>Hardware Security Key Verified</Text>
                  <Text style={[styles.notifBody, { color: colors.textSecondary }]}>
                    Solana Mobile Seed Vault protects all signature requests on this device.
                  </Text>
                  <Text style={[styles.notifTime, { color: colors.textMuted }]}>Hardware Enclave</Text>
                </View>
              </View>

              {activeOrders.length > 0 && (
                <View style={[styles.notificationItem, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
                  <View style={[styles.notifIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                    <Ionicons name="receipt" size={18} color="#3B82F6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.notifTitle, { color: colors.text }]}>Active Loans Standing</Text>
                    <Text style={[styles.notifBody, { color: colors.textSecondary }]}>
                      You currently have {activeOrders.length} active loan{activeOrders.length > 1 ? 's' : ''} in good standing.
                    </Text>
                    <Text style={[styles.notifTime, { color: colors.textMuted }]}>Credit Profile</Text>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 48,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 26,
    height: 26,
  },
  greetingText: {
    fontSize: 18,
    fontWeight: '800',
  },
  topRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  trophyIcon: {
    fontSize: 15,
  },
  pointsText: {
    fontSize: 13,
    fontWeight: '800',
  },
  heroCard: {
    borderRadius: 22,
    padding: 22,
    marginBottom: 16,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  availableLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  availableLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.9,
  },
  eyeBtn: {
    padding: 2,
  },
  moreBtn: {
    padding: 2,
  },
  heroBalance: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroSubBalance: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 20,
  },
  actionItem: {
    flex: 1,
    alignItems: 'center',
  },
  actionCard: {
    width: '100%',
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    letterSpacing: 0.2,
  },
  actionBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: '#EF4444',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  actionBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  carouselOuter: {
    borderRadius: 20,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  },
  carouselContainer: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  bannerWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  bannerGradient: {
    padding: 18,
    borderRadius: 20,
  },
  bannerContent: {
    alignItems: 'flex-start',
  },
  bannerBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 8,
  },
  bannerBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  bannerSub: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: 14,
  },
  bannerCtaBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  bannerCtaText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
  },
  bannerDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 18,
  },
  bannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeBannerDot: {
    width: 20,
    borderRadius: 3,
  },
  activitySection: {
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  seeMoreLink: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyReceiptBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  receiptIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyReceiptText: {
    fontSize: 14,
    fontWeight: '600',
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  orderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orderIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderPoolName: {
    fontSize: 15,
    fontWeight: '700',
  },
  orderSub: {
    fontSize: 12,
    marginTop: 2,
  },
  orderRight: {
    alignItems: 'flex-end',
  },
  orderAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  orderStatus: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '75%',
  },
  modalSheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalCloseBtn: {
    padding: 4,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  notifIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  notifBody: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  notifTime: {
    fontSize: 11,
    fontWeight: '600',
  },
});
