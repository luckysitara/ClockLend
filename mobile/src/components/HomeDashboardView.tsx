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
  onRefresh?: () => void;
  isLoading?: boolean;
}

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
  onRefresh,
  isLoading = false,
}) => {
  const { colors, mode } = useTheme();
  const [showBalance, setShowBalance] = useState<boolean>(true);
  const [activeBanner, setActiveBanner] = useState<number>(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState<boolean>(false);

  const bannerFadeAnim = useRef(new Animated.Value(1)).current;
  const bannerSlideAnim = useRef(new Animated.Value(0)).current;

  const availableUsdc = walletAssets?.usdcBalance || 0;

  // 3 Dynamic Rotating Showcase Banners (Matches 8febc333 Dangote banner layout)
  const BANNER_CARDS = [
    {
      id: 'lowest_apr',
      badge: 'LOWEST APR DESK',
      title: 'Solana Foundation Desk',
      sub: '8.5% Fixed APR • $250,000 USDC Capacity',
      cta: 'Borrow Now →',
      onPress: onNavigateBorrow,
      gradient: ['#1E3A8A', '#1D4ED8', '#2563EB'] as const,
    },
    {
      id: 'leaderboard',
      badge: 'SEEKER HALL OF FAME',
      title: 'Top 3 Borrowers',
      sub: '1. @sol_whale • 2. @alpha_dev • 3. @crypto_king',
      cta: 'View Rankings →',
      onPress: onOpenLeaderboard,
      gradient: ['#0F172A', '#1E3A8A', '#2563EB'] as const,
    },
    {
      id: 'social_grace',
      badge: 'ZERO LIQUIDATION CLIFF',
      title: '24-Hour Social Grace',
      sub: 'Escrow protection against sudden market flash crashes',
      cta: 'Explore Desks →',
      onPress: onNavigateDesks,
      gradient: ['#042F2E', '#0D9488', '#14B8A6'] as const,
    },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      Animated.parallel([
        Animated.timing(bannerFadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(bannerSlideAnim, { toValue: -6, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        setActiveBanner((prev) => (prev + 1) % BANNER_CARDS.length);
        bannerSlideAnim.setValue(6);
        Animated.parallel([
          Animated.timing(bannerFadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(bannerSlideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start();
      });
    }, 4200);

    return () => clearInterval(timer);
  }, []);

  const banner = BANNER_CARDS[activeBanner];

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
      {/* ── Top Header Row (Matches 8febc333) ── */}
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

      {/* ── Deep Blue Gradient Hero Balance Card (Matches 8febc333) ── */}
      <LinearGradient
        colors={mode === 'dark' ? ['#172554', '#1E40AF', '#2563EB'] : ['#1E3A8A', '#1D4ED8', '#2563EB']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.availableLabelRow}>
            <Text style={styles.availableLabel}>Available Balance</Text>
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
          {showBalance ? `$${availableUsdc.toFixed(2)}` : '$ ••••'}
        </Text>
        <Text style={styles.heroSubBalance}>
          {showBalance ? `~ ${solBalance.toFixed(3)} SOL • Solana Mainnet` : '•••• SOL'}
        </Text>
      </LinearGradient>

      {/* ── 3 Action Buttons (Matches 8febc333) ── */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onNavigateBorrow();
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Borrow funds"
        >
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={[styles.actionBtnText, { color: colors.text }]}>Borrow</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onNavigateRepay();
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Repay loan"
        >
          <Ionicons name="paper-plane-outline" size={16} color={colors.primary} />
          <Text style={[styles.actionBtnText, { color: colors.text }]}>Repay</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onNavigateDesks();
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Explore desks"
        >
          <Ionicons name="business-outline" size={16} color={colors.primary} />
          <Text style={[styles.actionBtnText, { color: colors.text }]}>Desks</Text>
        </TouchableOpacity>
      </View>

      {/* ── Auto-Rotating Showcase Banner Card (Matches 8febc333 Dangote banner) ── */}
      <TouchableOpacity
        style={styles.bannerWrapper}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          banner.onPress();
        }}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={banner.title}
      >
        <LinearGradient
          colors={banner.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bannerGradient}
        >
          <Animated.View
            style={[
              styles.bannerContent,
              {
                opacity: bannerFadeAnim,
                transform: [{ translateY: bannerSlideAnim }],
              },
            ]}
          >
            <View style={styles.bannerBadge}>
              <Text style={styles.bannerBadgeText}>{banner.badge}</Text>
            </View>
            <Text style={styles.bannerTitle}>{banner.title}</Text>
            <Text style={styles.bannerSub}>{banner.sub}</Text>

            <View style={styles.bannerCtaBtn}>
              <Text style={styles.bannerCtaText}>{banner.cta}</Text>
            </View>
          </Animated.View>
        </LinearGradient>
      </TouchableOpacity>

      {/* Banner Carousel Indicator Dots */}
      <View style={styles.bannerDotsRow}>
        {BANNER_CARDS.map((b, idx) => (
          <TouchableOpacity
            key={b.id}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              setActiveBanner(idx);
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
    gap: 12,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  bannerWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
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
