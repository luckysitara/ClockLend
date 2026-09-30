import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Switch,
  Linking,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';

export interface SettingsViewProps {
  onBack: () => void;
  skrHandle: string;
  hasCustomPin: boolean;
  lockEnabled: boolean;
  onToggleLock: (val: boolean) => void;
  onSetupPin: () => void;
  onChangePin: () => void;
  onLockApp: () => void;
  onOpenLeaderboard: () => void;
  onOpenJudgeBriefing: () => void;
  onOpenAssetsModal: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onBack,
  skrHandle,
  hasCustomPin,
  lockEnabled,
  onToggleLock,
  onSetupPin,
  onChangePin,
  onLockApp,
  onOpenLeaderboard,
  onOpenJudgeBriefing,
  onOpenAssetsModal,
}) => {
  const { colors, mode, toggleTheme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Top Header Row with Safe Status Bar Inset ── */}
      <View style={[styles.headerRow, { borderBottomColor: colors.divider }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            try { Haptics.selectionAsync(); } catch {}
            onBack();
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Section 1: Profile Info ── */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Profile Info</Text>
          <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={onBack}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
                <Ionicons name="person-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.textCol}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>My Profile</Text>
                <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                  Connected as {skrHandle}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                if (hasCustomPin) onChangePin();
                else onSetupPin();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
                <Ionicons name="shield-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.textCol}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Security</Text>
                <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                  {hasCustomPin ? 'Change PIN & Biometrics' : 'Set up 4-Digit Security PIN'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

            <View style={styles.settingRow}>
              <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.textCol}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>App Lock on Resume</Text>
                <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                  Require unlock each launch
                </Text>
              </View>
              <Switch
                value={lockEnabled}
                onValueChange={onToggleLock}
                trackColor={{ false: colors.cardBorder, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {/* ── Section 2: Preference ── */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Preference</Text>
          <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                toggleTheme();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
                <Ionicons
                  name={mode === 'dark' ? 'moon-outline' : 'sunny-outline'}
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={styles.textCol}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Appearance</Text>
                <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                  Current: {mode === 'dark' ? 'Dark Obsidian' : 'Light Clean'}
                </Text>
              </View>
              <View style={[styles.pillBadge, { backgroundColor: colors.cardAlt }]}>
                <Text style={[styles.pillBadgeText, { color: colors.primaryLabel }]}>
                  {mode.toUpperCase()}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

            <TouchableOpacity
              style={styles.settingRow}
              onPress={onOpenAssetsModal}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
                <Ionicons name="cash-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.textCol}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Currency Display</Text>
                <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                  USDC / USD & SOL Balances
                </Text>
              </View>
              <View style={[styles.pillBadge, { backgroundColor: colors.cardAlt }]}>
                <Text style={[styles.pillBadgeText, { color: colors.primaryLabel }]}>USDC</Text>
              </View>
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

            <TouchableOpacity
              style={styles.settingRow}
              onPress={onOpenLeaderboard}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, { backgroundColor: 'rgba(234, 179, 8, 0.15)' }]}>
                <Ionicons name="trophy-outline" size={20} color="#EAB308" />
              </View>
              <View style={styles.textCol}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Hall of Fame</Text>
                <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                  Leaderboard & borrower reputation
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* ── Section 3: General ── */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>General</Text>
          <View style={[styles.cardGroup, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={onOpenJudgeBriefing}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
                <Ionicons name="document-text-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.textCol}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Judge Briefing</Text>
                <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                  Architecture & security invariants
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.divider }]} />

            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => {
                Linking.openURL('https://solscan.io/account/9ikmDTbbRhtgYKjRhcnzCK9RpPWQ8uTYUeNJ16kWMLSG').catch(() => {});
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
                <Ionicons name="open-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.textCol}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Program on Solscan</Text>
                <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                  Verified Solana Mainnet program
                </Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {hasCustomPin && lockEnabled && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.divider }]} />
                <TouchableOpacity
                  style={styles.settingRow}
                  onPress={() => {
                    onBack();
                    onLockApp();
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconCircle, { backgroundColor: colors.badgeBg }]}>
                    <Ionicons name="lock-closed" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.textCol}>
                    <Text style={[styles.rowTitle, { color: colors.primaryLabel }]}>Lock App Now</Text>
                    <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                      Immediately trigger security lock screen
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.primaryLabel} />
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
  );
};

export interface SettingsModalProps extends SettingsViewProps {
  visible: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = (props) => {
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <SettingsView {...props} onBack={props.onClose} />
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 10,
    paddingHorizontal: 4,
    letterSpacing: 0.3,
  },
  cardGroup: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCol: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  rowSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  pillBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
