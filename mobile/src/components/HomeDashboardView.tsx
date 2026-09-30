import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Image,
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

  const availableUsdc = walletAssets?.usdcBalance || 0;
  const initials = (skrHandle.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) || 'SK').toUpperCase();

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
            tintColor="#D97706"
            colors={['#D97706']}
          />
        ) : undefined
      }
    >
      {/* ── Top Header Row (Matches 8febc333) ── */}
      <View style={styles.topHeader}>
        <View style={styles.userSection}>
          <View style={[styles.avatar, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Text style={[styles.avatarText, { color: colors.text }]}>{initials}</Text>
          </View>
          <View>
            <Text style={[styles.greetingText, { color: colors.text }]}>Hello, {skrHandle}</Text>
          </View>
        </View>

        <View style={styles.topRightControls}>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            onPress={onOpenAssetsModal}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={18} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pointsPill, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            onPress={onOpenLeaderboard}
            activeOpacity={0.7}
          >
            <Text style={styles.trophyIcon}>🏅</Text>
            <Text style={[styles.pointsText, { color: colors.text }]}>
              {userProfile.reputationScore > 0 ? `${(userProfile.reputationScore / 100).toFixed(0)} pts` : '0 pts'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Golden Gradient Hero Balance Card (Matches 8febc333) ── */}
      <LinearGradient
        colors={['#B45309', '#D97706', '#F59E0B']}
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
            >
              <Ionicons
                name={showBalance ? 'eye-outline' : 'eye-off-outline'}
                size={18}
                color="rgba(255, 255, 255, 0.85)"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onOpenAssetsModal} style={styles.moreBtn}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <Text style={styles.heroBalance}>
          {showBalance ? `$${availableUsdc.toFixed(2)}` : '$ ••••'}
        </Text>
        <Text style={styles.heroSubBalance}>
          {showBalance ? `~ ${solBalance.toFixed(3)} SOL • Mainnet` : '•••• SOL'}
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
        >
          <Ionicons name="add" size={18} color="#D97706" />
          <Text style={[styles.actionBtnText, { color: colors.text }]}>Borrow</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onNavigateRepay();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="paper-plane-outline" size={16} color="#D97706" />
          <Text style={[styles.actionBtnText, { color: colors.text }]}>Repay</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onNavigateDesks();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="business-outline" size={16} color="#D97706" />
          <Text style={[styles.actionBtnText, { color: colors.text }]}>Desks</Text>
        </TouchableOpacity>
      </View>

      {/* ── Banner Card (Matches 8febc333 promo banner) ── */}
      <TouchableOpacity
        style={[styles.bannerCard, { backgroundColor: mode === 'dark' ? '#1A1713' : '#FEF3C7', borderColor: '#F59E0B40' }]}
        onPress={onNavigateBorrow}
        activeOpacity={0.8}
      >
        <View style={styles.bannerContent}>
          <Text style={[styles.bannerTitle, { color: mode === 'dark' ? '#FDE68A' : '#92400E' }]}>
            Instant USDC Liquidity
          </Text>
          <Text style={[styles.bannerSub, { color: mode === 'dark' ? '#D1D5DB' : '#78350F' }]}>
            Borrow against SOL or SKR with 24h Social Grace Shield.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#D97706" />
      </TouchableOpacity>

      {/* ── Activity Section (Matches 8febc333) ── */}
      <View style={styles.activitySection}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Activity</Text>
          <TouchableOpacity onPress={onNavigateRepay} activeOpacity={0.7}>
            <Text style={[styles.seeMoreLink, { color: '#D97706' }]}>See more</Text>
          </TouchableOpacity>
        </View>

        {activeOrders.length === 0 ? (
          /* Empty Receipt Doodle (Matches 8febc333 exactly) */
          <View style={styles.emptyReceiptBox}>
            <View style={[styles.receiptIconCircle, { backgroundColor: colors.cardAlt }]}>
              <Ionicons name="receipt-outline" size={44} color="#D97706" />
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
                  <View style={[styles.orderIconBg, { backgroundColor: inGrace ? 'rgba(245, 158, 11, 0.15)' : 'rgba(52, 211, 153, 0.15)' }]}>
                    <Ionicons
                      name={inGrace ? 'time' : 'checkmark-circle'}
                      size={20}
                      color={inGrace ? '#F59E0B' : '#34D399'}
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
                  <Text style={[styles.orderStatus, { color: inGrace ? '#F59E0B' : '#34D399' }]}>
                    {inGrace ? 'Grace Active' : 'Active'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
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
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '800',
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
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  trophyIcon: {
    fontSize: 14,
  },
  pointsText: {
    fontSize: 13,
    fontWeight: '700',
  },
  heroCard: {
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  availableLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  availableLabel: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '600',
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
    color: 'rgba(255, 255, 255, 0.85)',
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
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 20,
  },
  bannerContent: {
    flex: 1,
    marginRight: 10,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  bannerSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  activitySection: {
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
    paddingVertical: 36,
  },
  receiptIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
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
});
