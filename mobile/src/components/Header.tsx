import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';

interface HeaderProps {
  skrHandle: string;
  solBalance: number;
  hasSeekerGenesisToken?: boolean;
  isProfileActive?: boolean;
  onPressProfile: () => void;
  onPressBalance?: () => void;
  onDisconnectWallet?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenJudgeBriefing?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  skrHandle,
  solBalance,
  hasSeekerGenesisToken = false,
  isProfileActive = false,
  onPressProfile,
  onPressBalance,
  onDisconnectWallet,
  onOpenLeaderboard,
  onOpenJudgeBriefing,
}) => {
  const { colors, mode, toggleTheme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderBottomColor: colors.cardBorder }]}>
      {/* Left: Brand Identity or Account Title */}
      {isProfileActive ? (
        <View style={styles.headerTitleGroup}>
          <Text style={[styles.screenTitle, { color: colors.text }]} numberOfLines={1}>Seeker Account</Text>
          <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>Identity & Credit Profile</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.profileButton}
          onPress={onPressProfile}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Account profile for ${skrHandle}`}
        >
          <View style={[styles.avatar, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <Image source={require('../../assets/logo.png')} style={styles.logoImg} resizeMode="contain" />
          </View>
          <View style={styles.profileTextWrap}>
            <View style={styles.handleRow}>
              <Text style={[styles.brandName, { color: colors.text }]} numberOfLines={1}>ClockLend</Text>
              {hasSeekerGenesisToken && (
                <View style={[styles.verifiedDot, { backgroundColor: colors.primary }]} />
              )}
            </View>
            <Text style={[styles.handleSub, { color: colors.primaryLabel }]} numberOfLines={1}>{skrHandle}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Right: Actions */}
      <View style={styles.rightActions}>
        {onOpenLeaderboard && (
          <TouchableOpacity
            style={[
              styles.themeChip,
              { backgroundColor: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.3)' },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onOpenLeaderboard();
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Seeker Hall of Fame leaderboard"
            accessibilityHint="View on-chain top borrowers and lenders"
          >
            <Ionicons name="trophy-outline" size={16} color={colors.warning} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.themeChip, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleTheme();
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Toggle color theme, currently ${mode} mode`}
        >
          <Ionicons name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'} size={16} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.walletPill, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
          onPress={onPressBalance || onDisconnectWallet}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Wallet assets and balances"
          accessibilityHint="View token accounts and balances"
        >
          <View style={[styles.onlineDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.walletPillText, { color: colors.text }]} numberOfLines={1}>
            {solBalance > 0 ? `${solBalance.toFixed(2)} SOL` : 'Assets'}
          </Text>
        </TouchableOpacity>

        {onDisconnectWallet && (
          <TouchableOpacity
            style={[
              styles.themeChip,
              { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.28)' },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Alert.alert(
                'Disconnect Wallet',
                `Log out of ${skrHandle}?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Disconnect', style: 'destructive', onPress: onDisconnectWallet },
                ]
              );
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Disconnect wallet"
          >
            <Ionicons name="log-out-outline" size={16} color={colors.danger} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  profileButton: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileTextWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  logoImg: {
    width: 22,
    height: 22,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 18,
  },
  headerTitleGroup: {
    justifyContent: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  brandName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  handleSub: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  handleText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  verifiedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  subtext: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  themeChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  walletPillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
