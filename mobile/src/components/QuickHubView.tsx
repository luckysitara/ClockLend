import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';

interface QuickHubViewProps {
  onNavigateBorrow: () => void;
  onNavigateDesks: () => void;
  onNavigateLoans: () => void;
  onNavigateProfile: () => void;
  onOpenAssetsModal: () => void;
  onOpenLeaderboard: () => void;
  onOpenJudgeBriefing: () => void;
  onLockApp: () => void;
}

export const QuickHubView: React.FC<QuickHubViewProps> = ({
  onNavigateBorrow,
  onNavigateDesks,
  onNavigateLoans,
  onNavigateProfile,
  onOpenAssetsModal,
  onOpenLeaderboard,
  onOpenJudgeBriefing,
  onLockApp,
}) => {
  const { colors } = useTheme();
  // Small phones (360-400dp): shrink the page title so it never clips.
  const { width } = useWindowDimensions();
  const isCompact = width < 400;
  const [searchQuery, setSearchQuery] = useState('');

  const actions = [
    {
      id: 'borrow',
      title: 'Borrow',
      icon: 'flash-outline' as const,
      onPress: onNavigateBorrow,
    },
    {
      id: 'desks',
      title: 'Desks',
      icon: 'storefront-outline' as const,
      onPress: onNavigateDesks,
    },
    {
      id: 'loans',
      title: 'Loans',
      icon: 'receipt-outline' as const,
      onPress: onNavigateLoans,
    },
    {
      id: 'wallet',
      title: 'Assets',
      icon: 'wallet-outline' as const,
      onPress: onOpenAssetsModal,
    },
    {
      id: 'staking',
      title: 'Staking',
      icon: 'leaf-outline' as const,
      onPress: onNavigateProfile,
    },
    {
      id: 'leaderboard',
      title: 'Leaderboard',
      icon: 'trophy-outline' as const,
      onPress: onOpenLeaderboard,
    },
    {
      id: 'security',
      title: 'Security',
      icon: 'shield-checkmark-outline' as const,
      onPress: onLockApp,
    },
  ];

  const filteredActions = actions.filter((a) =>
    a.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Title */}
      <Text
        style={[styles.headerTitle, { color: colors.text }, isCompact && styles.headerTitleCompact]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        ClockLend Hub
      </Text>

      {/* Search Input (Matches 94347e6f) */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search features..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* 4x2 Grid of Rounded Action Cards (Matches 94347e6f) */}
      <View style={styles.grid}>
        {filteredActions.map((action) => (
          <TouchableOpacity
            key={action.id}
            style={[styles.gridTile, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              action.onPress();
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.tileIconCircle, { backgroundColor: colors.badgeBg }]}>
              <Ionicons name={action.icon} size={24} color={colors.primary} />
            </View>
            <Text style={[styles.tileTitle, { color: colors.text }]}>{action.title}</Text>
          </TouchableOpacity>
        ))}
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
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  headerTitleCompact: {
    fontSize: 20,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 24,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridTile: {
    flexGrow: 1,
    flexBasis: '47%',
    aspectRatio: 1.15,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  tileIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  tileTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
});
