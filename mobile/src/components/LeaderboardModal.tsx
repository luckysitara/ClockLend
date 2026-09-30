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
  // A failed read used to be console.warn only, so it rendered as the empty
  // state — "No On-Chain Profiles Found" for a query that never answered.
  // Cleared only by a read that actually succeeds.
  const [loadFailed, setLoadFailed] = useState<boolean>(false);
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
      setLoadFailed(false);
    } catch (e) {
      console.warn('Error loading leaderboard:', e);
      setLoadFailed(true);
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
      setLoadFailed(false);
    } catch (e) {
      console.warn('Refresh error:', e);
      setLoadFailed(true);
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
        return colors.accent;
      case 'Tier 1':
        return colors.warning;
      default:
        return colors.textMuted;
    }
  };

  const getRankBadge = (rank: number) => {
    // The medal itself is an emoji, so its colour is chrome, not the medal
    // scale: route it through the theme (bronze #b45309 stays, it has no token
    // and is dark enough to read on both backgrounds).
    if (rank === 1) return { icon: '🥇', color: colors.warning };
    if (rank === 2) return { icon: '🥈', color: colors.textSecondary };
    if (rank === 3) return { icon: '🥉', color: '#b45309' };
    return { icon: `#${rank}`, color: colors.textSecondary };
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss leaderboard"
        />
        <View style={[styles.container, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
            <View style={styles.titleRow}>
              <View style={[styles.trophyCircle, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                <Ionicons name="trophy" size={20} color={colors.warning} />
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
                    tierFilter === tier && { color: colors.primaryLabel, fontWeight: '800' },
                  ]}
                >
                  {tier === 'ALL' ? 'All Tiers' : `${tier} Tier`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Leaderboard List — the states are mutually exclusive by
              construction. 'error' is unreachable while entries are on screen
              (they render with a banner above them instead), and it takes over
              whenever the failed read would otherwise leave nothing to show —
              so the empty state below is never reachable while loadFailed is
              set, for any tier filter. */}
          {isLoading && entries.length === 0 && !loadFailed ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Scanning Solana Mainnet User Profiles...
              </Text>
            </View>
          ) : loadFailed && filteredEntries.length === 0 ? (
            <View style={styles.errorWrap}>
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.danger }]}>
                <Text style={styles.emptyIcon}>⚠️</Text>
                <Text style={[styles.stateLabel, { color: colors.danger }]}>RANKINGS NOT READ</Text>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  Could Not Load the Leaderboard
                </Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                  Reading UserProfile PDAs from Solana Mainnet failed, so the rankings are unknown —
                  this is not an empty result.
                </Text>
                <TouchableOpacity
                  style={[
                    styles.retryBtn,
                    { backgroundColor: colors.primary },
                    isLoading && styles.stateDisabled,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    loadData();
                  }}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  {isLoading && <ActivityIndicator size="small" color={colors.primaryText} />}
                  <Text style={[styles.retryBtnText, { color: colors.primaryText }]}>
                    {isLoading ? 'Retrying...' : 'Retry'}
                  </Text>
                </TouchableOpacity>
              </View>
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
              {loadFailed && (
                <View
                  style={[styles.refreshFailedCard, { backgroundColor: colors.cardAlt, borderColor: colors.danger }]}
                >
                  <Text style={[styles.stateLabel, { color: colors.danger }]}>REFRESH FAILED</Text>
                  <Text style={[styles.refreshFailedText, { color: colors.textSecondary }]}>
                    Could not refresh from Solana just now — these rankings are the last result we
                    read, not a fresh confirmation.
                  </Text>
                </View>
              )}

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
                      entry.rank === 1 && { borderColor: 'rgba(245, 158, 11, 0.4)' },
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
                            <Text style={[styles.youTagText, { color: colors.primaryLabel }]}>YOU</Text>
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
                      <Text style={[styles.scoreValue, { color: colors.primaryLabel }]}>
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
  errorWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  stateLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  // Same dimming discipline as the rest of the app: a disabled control must
  // look disabled.
  stateDisabled: {
    opacity: 0.6,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 16,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  refreshFailedCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  refreshFailedText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
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
