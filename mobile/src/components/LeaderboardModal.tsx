import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { LeaderboardEntry, fetchLiveLeaderboard } from '../solana/onChainService';
import { CreditTier, SolanaNetwork } from '../types';
import { PublicKey } from '@solana/web3.js';
import * as Haptics from 'expo-haptics';

interface LeaderboardModalProps {
  visible: boolean;
  onClose: () => void;
  network?: SolanaNetwork;
  currentUserPubkey?: PublicKey;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  visible,
  onClose,
  network = 'mainnet-beta',
  currentUserPubkey,
}) => {
  const { colors } = useTheme();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  // C-2: filters mirror the program's bond tiers (the only tiers it grants).
  const [tierFilter, setTierFilter] = useState<'ALL' | CreditTier>('ALL');

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, network]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchLiveLeaderboard(network, currentUserPubkey);
      setEntries(data);
    } catch (e) {
      console.warn('Error loading leaderboard:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const data = await fetchLiveLeaderboard(network, currentUserPubkey);
      setEntries(data);
    } catch (e) {
      console.warn('Refresh error:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredEntries = entries.filter((e) => {
    if (tierFilter === 'ALL') return true;
    return e.tier === tierFilter;
  });

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'Tier 2':
        return '#38bdf8';
      case 'Tier 1':
        return '#f59e0b';
      default:
        return colors.textMuted;
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return { icon: '🥇', color: '#eab308' };
    if (rank === 2) return { icon: '🥈', color: '#94a3b8' };
    if (rank === 3) return { icon: '🥉', color: '#b45309' };
    return { icon: `#${rank}`, color: colors.textSecondary };
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
            <View style={styles.titleRow}>
              <View style={[styles.trophyCircle, { backgroundColor: 'rgba(234, 179, 8, 0.15)' }]}>
                <Ionicons name="trophy" size={20} color="#eab308" />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>Seeker Hall of Fame</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  On-Chain Credit & Reputation Rankings
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.cardAlt }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Decentralized Verification Banner */}
          <View style={[styles.chainBanner, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.bannerRow}>
              <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.bannerText, { color: colors.text }]}>
                100% On-Chain • Zero Centralized Database
              </Text>
            </View>
            <Text style={[styles.bannerSub, { color: colors.textMuted }]}>
              Queried live via getProgramAccounts from Solana Mainnet-beta UserProfile PDAs.
            </Text>
          </View>

          {/* Tier Filter Chips */}
          <View style={styles.filterRow}>
            {(['ALL', 'Tier 2', 'Tier 1', 'Standard'] as const).map((tier) => (
              <TouchableOpacity
                key={tier}
                style={[
                  styles.filterChip,
                  { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder },
                  tierFilter === tier && { backgroundColor: colors.badgeBg, borderColor: colors.primary },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setTierFilter(tier);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: colors.textSecondary },
                    tierFilter === tier && { color: colors.primary, fontWeight: '800' },
                  ]}
                >
                  {tier === 'ALL' ? 'All Tiers' : `${tier} Tier`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Leaderboard List */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Scanning Solana Mainnet User Profiles...
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scrollList}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
              }
            >
              {filteredEntries.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                  <Text style={styles.emptyIcon}>🏆</Text>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No On-Chain Profiles Found</Text>
                  <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                    No registered borrower or staker profiles found on Solana Mainnet for this tier yet. Complete your first loan or stake an SKR reputation bond to rank on the Hall of Fame!
                  </Text>
                </View>
              ) : (
                filteredEntries.map((entry) => {
                const rankBadge = getRankBadge(entry.rank);
                const tierColor = getTierColor(entry.tier);

                return (
                  <View
                    key={entry.pubkey}
                    style={[
                      styles.entryCard,
                      { backgroundColor: colors.card, borderColor: colors.cardBorder },
                      entry.isCurrentUser && { borderColor: colors.primary, borderWidth: 1.5 },
                      entry.rank === 1 && { borderColor: 'rgba(234, 179, 8, 0.4)' },
                    ]}
                  >
                    <View style={styles.rankCol}>
                      <Text style={[styles.rankIcon, { color: rankBadge.color }]}>{rankBadge.icon}</Text>
                    </View>

                    <View style={styles.infoCol}>
                      <View style={styles.handleLine}>
                        <Text style={[styles.handleText, { color: colors.text }]}>{entry.skrHandle}</Text>
                        {entry.isCurrentUser && (
                          <View style={[styles.youTag, { backgroundColor: colors.badgeBg }]}>
                            <Text style={[styles.youTagText, { color: colors.primary }]}>YOU</Text>
                          </View>
                        )}
                        <View style={[styles.tierPill, { backgroundColor: `${tierColor}15`, borderColor: tierColor }]}>
                          <Text style={[styles.tierPillText, { color: tierColor }]}>{entry.tier}</Text>
                        </View>
                      </View>

                      <View style={styles.metaLine}>
                        <Text style={[styles.metaText, { color: colors.textMuted }]}>
                          {entry.pubkey.slice(0, 4)}...{entry.pubkey.slice(-4)} • {entry.totalLoansCompleted} loans • {entry.stakedSkr.toLocaleString()} SKR
                        </Text>
                      </View>
                    </View>

                    <View style={styles.scoreCol}>
                      <Text style={[styles.scoreValue, { color: colors.primary }]}>
                        {(entry.reputationScore / 100).toFixed(1)}%
                      </Text>
                      <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>Score</Text>
                    </View>
                  </View>
                );
              }))}

              <View style={styles.footerNote}>
                <Text style={[styles.footerText, { color: colors.textMuted }]}>
                  Reputation is computed autonomously by the ClockLend program based on timely loan repayments and locked SKR bonds.
                </Text>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    height: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  trophyCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chainBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  bannerText: {
    fontSize: 12,
    fontWeight: '800',
  },
  bannerSub: {
    fontSize: 10,
    marginTop: 4,
    lineHeight: 14,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  scrollList: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  rankCol: {
    width: 34,
    alignItems: 'center',
  },
  rankIcon: {
    fontSize: 16,
    fontWeight: '900',
  },
  infoCol: {
    flex: 1,
    paddingHorizontal: 10,
  },
  handleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  handleText: {
    fontSize: 14,
    fontWeight: '800',
  },
  youTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  youTagText: {
    fontSize: 9,
    fontWeight: '900',
  },
  tierPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
  },
  tierPillText: {
    fontSize: 9,
    fontWeight: '800',
  },
  metaLine: {
    marginTop: 3,
  },
  metaText: {
    fontSize: 11,
  },
  scoreCol: {
    alignItems: 'flex-end',
    minWidth: 50,
  },
  scoreValue: {
    fontSize: 15,
    fontWeight: '900',
  },
  scoreLabel: {
    fontSize: 10,
    marginTop: 1,
  },
  footerNote: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 20,
  },
  emptyCard: {
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginHorizontal: 8,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
