import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';

interface QuickStartBarProps {
  /** Preset borrow amount in USDC — prefills the borrow flow and opens the BORROW tab. */
  onPresetAmount: (amountUsd: string) => void;
  onDismiss: () => void;
}

const PRESET_AMOUNTS = ['10', '25', '50'];

/**
 * Post-auth first-time guided bar. All copy is truthful against the on-chain program:
 * the 24h grace window is term-triggered (no price-based liquidation exists), and the
 * presets route into the real mainnet borrow flow — no demo mode.
 */
export const QuickStartBar: React.FC<QuickStartBarProps> = ({
  onPresetAmount,
  onDismiss,
}) => {
  const { colors } = useTheme();

  const tap = (fn: () => void) => () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    fn();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      {/* Grace shield + dismiss */}
      <View style={styles.shieldRow}>
        <View style={styles.shieldBadge}>
          <Ionicons name="shield-checkmark" size={13} color={colors.success} />
          <Text style={[styles.shieldText, { color: colors.success }]}>
            24H GRACE SHIELD · NO INSTANT LIQUIDATION
          </Text>
        </View>
        <TouchableOpacity
          onPress={tap(onDismiss)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Dismiss quick start guide"
        >
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* 1-tap borrow presets */}
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>QUICK START · BORROW IN ONE TAP</Text>
      <View style={styles.chipsRow}>
        {PRESET_AMOUNTS.map((amt) => (
          <TouchableOpacity
            key={amt}
            style={[styles.presetChip, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
            onPress={tap(() => onPresetAmount(amt))}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Quick borrow ${amt} dollars`}
          >
            <Text style={[styles.presetChipText, { color: colors.primaryLabel }]}>Borrow ${amt}</Text>
          </TouchableOpacity>
        ))}
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  shieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  shieldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  shieldText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
