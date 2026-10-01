import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
  const { colors, mode } = useTheme();
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
      <Text style={[styles.headerTitle, { color: colors.text }]}>ClockLend Hub</Text>

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

      {/* 4x2 Grid of Rounded Action Cards (Brand Primary Color Gradient) */}
      <View style={styles.grid}>
        {filteredActions.map((action) => (
          <TouchableOpacity
            key={action.id}
            style={styles.gridTileWrapper}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              action.onPress();
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={action.title}
          >
            <LinearGradient
              colors={
                mode === 'dark'
                  ? ['#172554', '#1E40AF', '#2563EB']
                  : ['#1E3A8A', '#1D4ED8', '#2563EB']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gridTile}
            >
              <View style={styles.tileIconCircle}>
                <Ionicons name={action.icon} size={24} color="#FFFFFF" />
              </View>
              <Text style={styles.tileTitle}>{action.title}</Text>
            </LinearGradient>
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
  gridTileWrapper: {
    width: '48%',
    aspectRatio: 1.15,
    borderRadius: 20,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  gridTile: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  tileIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  tileTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
