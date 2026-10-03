import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export type NoticeType = 'borrow' | 'repay' | 'grace' | 'success' | 'error' | 'info';

export interface TransactionNoticeData {
  type: NoticeType;
  title: string;
  subtitle?: string;
  amount?: string;
  collateral?: string;
  txSignature?: string;
  solscanUrl?: string;
  escrowAddress?: string;
  primaryBtnText?: string;
  onPrimaryPress?: () => void;
  secondaryBtnText?: string;
  onSecondaryPress?: () => void;
}

interface TransactionNoticeModalProps {
  visible: boolean;
  data: TransactionNoticeData | null;
  onClose: () => void;
}

export const TransactionNoticeModal: React.FC<TransactionNoticeModalProps> = ({
  visible,
  data,
  onClose,
}) => {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  // Small screens (360-400dp) get tighter gutters so the card keeps room.
  const isCompact = width < 400;

  if (!data) return null;

  const getIcon = () => {
    switch (data.type) {
      case 'borrow':
        return '⚡';
      case 'repay':
        return '🎉';
      case 'grace':
        return '🛡️';
      case 'error':
        return '⚠️';
      case 'info':
        return '💧';
      default:
        return '✓';
    }
  };

  const getIconBg = () => {
    switch (data.type) {
      case 'borrow':
      case 'repay':
      case 'success':
        return 'rgba(16, 185, 129, 0.15)';
      case 'grace':
        return 'rgba(168, 85, 247, 0.15)';
      case 'error':
        return 'rgba(239, 68, 68, 0.15)';
      case 'info':
        return 'rgba(59, 130, 246, 0.15)';
      default:
        return 'rgba(16, 185, 129, 0.15)';
    }
  };

  const handleOpenSolscan = () => {
    if (data.solscanUrl) {
      Linking.openURL(data.solscanUrl).catch(() => {});
    } else if (data.txSignature) {
      Linking.openURL(`https://solscan.io/tx/${data.txSignature}`).catch(() => {});
    }
  };

  const handleOpenEscrow = () => {
    if (data.escrowAddress) {
      Linking.openURL(`https://solscan.io/account/${data.escrowAddress}`).catch(() => {});
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, isCompact && { paddingHorizontal: 16 }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notice"
        />
        <View
          style={[
            styles.modalCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
            isCompact && { paddingHorizontal: 16, paddingBottom: 16 },
          ]}
        >
          {/* Top Close Button & Handle Bar */}
          <View style={styles.headerRow}>
            <View style={styles.handleBar} />
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colors.cardAlt }]}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close modal"
            >
              <Text style={[styles.closeBtnText, { color: colors.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Animated Icon Box */}
            <View style={[styles.iconCircle, { backgroundColor: getIconBg() }]}>
              <Text style={styles.iconText}>{getIcon()}</Text>
            </View>

            {/* Title & Subtitle */}
            <Text style={[styles.title, { color: colors.text }]}>{data.title}</Text>
            {data.subtitle ? (
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{data.subtitle}</Text>
            ) : null}

            {/* Key Metrics / Breakdown Box */}
            {(data.amount || data.collateral) && (
              <View style={[styles.statsCard, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
                {data.amount && (
                  <View style={styles.statRow}>
                    <Text
                      style={[styles.statLabel, { color: colors.textMuted }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {data.type === 'repay' ? 'Repaid Principal & Fee' : 'Disbursed USDC'}
                    </Text>
                    <Text style={[styles.statValue, { color: colors.primaryLabel }]} numberOfLines={1}>
                      {data.amount}
                    </Text>
                  </View>
                )}
                {data.collateral && (
                  <View style={styles.statRow}>
                    <Text
                      style={[styles.statLabel, { color: colors.textMuted }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {data.type === 'repay' ? 'Collateral Returned' : 'Collateral Locked'}
                    </Text>
                    <Text style={[styles.statValue, { color: colors.accentLight }]} numberOfLines={1}>
                      {data.collateral}
                    </Text>
                  </View>
                )}
                {/* No "Credit Boost +N pts" row: the program applies
                    `reputation_score.saturating_add(50).min(10000)`
                    (processor.rs:2644, :2656) to a score that STARTS at 10000
                    (processor.rs:709), so a blanket "+50 pts" would claim a
                    gain the program may never apply. Reputation changes are
                    read from the profile PDA and shown there. */}
              </View>
            )}

            {/* On-Chain Evidence Box */}
            {(data.txSignature || data.escrowAddress) && (
              <View style={[styles.evidenceBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
                <View style={styles.evidenceHeader}>
                  <View style={styles.evidenceDotRow}>
                    <View style={[styles.dotLive, { backgroundColor: colors.success }]} />
                    <Text
                      style={[styles.evidenceHeaderText, { color: colors.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      ON-CHAIN VERIFICATION
                    </Text>
                  </View>
                  <View style={[styles.networkBadge, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
                    <Text style={[styles.networkBadgeText, { color: colors.primaryLabel }]}>Solana Mainnet</Text>
                  </View>
                </View>

                {data.txSignature && (
                  <View style={styles.evidenceRow}>
                    <Text style={[styles.evidenceLabel, { color: colors.textMuted }]}>Tx Signature</Text>
                    <TouchableOpacity onPress={handleOpenSolscan} activeOpacity={0.7} style={styles.linkRow}>
                      <Text style={[styles.evidenceHash, { color: colors.accentLight }]} numberOfLines={1}>
                        {data.txSignature.slice(0, 8)}...{data.txSignature.slice(-8)} ↗
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {data.escrowAddress && (
                  <View style={styles.evidenceRow}>
                    <Text style={[styles.evidenceLabel, { color: colors.textMuted }]}>Escrow PDA</Text>
                    <TouchableOpacity onPress={handleOpenEscrow} activeOpacity={0.7} style={styles.linkRow}>
                      <Text style={[styles.evidenceHash, { color: colors.textSecondary }]} numberOfLines={1}>
                        {data.escrowAddress.slice(0, 8)}...{data.escrowAddress.slice(-8)} ↗
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Primary Action Button */}
            {data.solscanUrl || data.txSignature ? (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  if (data.onPrimaryPress) {
                    data.onPrimaryPress();
                  } else {
                    handleOpenSolscan();
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.primaryBtnText, { color: colors.primaryText }]}>
                  {data.primaryBtnText || 'View on Solscan ↗'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  if (data.onPrimaryPress) data.onPrimaryPress();
                  else onClose();
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.primaryBtnText, { color: colors.primaryText }]}>
                  {data.primaryBtnText || 'Got It'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Secondary Button */}
            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
              onPress={() => {
                if (data.onSecondaryPress) data.onSecondaryPress();
                onClose();
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                {data.secondaryBtnText || 'Done'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxHeight: '85%',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 12,
  },
  closeBtn: {
    position: 'absolute',
    right: 0,
    top: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(150, 150, 150, 0.4)',
    alignSelf: 'center',
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconText: {
    fontSize: 32,
  },
  title: {
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  statsCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 0,
  },
  evidenceBox: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  evidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  evidenceDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dotLive: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  evidenceHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  networkBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  networkBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  evidenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  evidenceLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  evidenceHash: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  primaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryBtn: {
    width: '100%',
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
