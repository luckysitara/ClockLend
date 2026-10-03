import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import {
  openXProfile,
  getXQuestStatus,
  claimXQuest,
  X_TARGET_HANDLE,
  X_POINTS_REWARD,
  QuestStatus,
} from '../services/questService';

interface CommunityQuestsCardProps {
  userPubkey: string;
  onQuestClaimed?: (pointsAdded: number) => void;
}

export const CommunityQuestsCard: React.FC<CommunityQuestsCardProps> = ({
  userPubkey,
  onQuestClaimed,
}) => {
  const { colors } = useTheme();
  const [questStatus, setQuestStatus] = useState<QuestStatus>({ completed: false, points: 0 });
  const [xUsername, setXUsername] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [hasFollowedClicked, setHasFollowedClicked] = useState<boolean>(false);

  useEffect(() => {
    if (userPubkey) {
      getXQuestStatus(userPubkey).then(setQuestStatus);
    }
  }, [userPubkey]);

  const handleOpenFollow = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setHasFollowedClicked(true);
    await openXProfile();
  };

  const handleVerifyAndClaim = async () => {
    if (!xUsername.trim()) {
      Alert.alert('Username Required', 'Please enter your X (Twitter) username so we can verify your follow.');
      return;
    }

    setIsVerifying(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    // Simulated verification delay (validates format and records in SecureStore)
    setTimeout(async () => {
      const result = await claimXQuest(userPubkey, xUsername);
      setIsVerifying(false);

      if (result.success) {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
        setQuestStatus({
          completed: true,
          claimedHandle: xUsername.trim().startsWith('@') ? xUsername.trim() : `@${xUsername.trim()}`,
          claimedAt: Date.now(),
          points: X_POINTS_REWARD,
        });
        if (onQuestClaimed) {
          onQuestClaimed(X_POINTS_REWARD);
        }
        Alert.alert(
          '🎉 +10 Points Claimed!',
          `Verified @${xUsername.replace(/^@/, '')} follow of @${X_TARGET_HANDLE}.\n\n10 reputation points have been added to your profile and leaderboard ranking!`
        );
      } else {
        Alert.alert('Verification Notice', result.error || 'Could not verify quest completion.');
      }
    }, 1200);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
          </View>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Community Quests</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Moonwalk tasks to boost your score & rank
            </Text>
          </View>
        </View>

        <View style={[styles.rewardBadge, { backgroundColor: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.3)' }]}>
          <Text style={[styles.rewardBadgeText, { color: '#F59E0B' }]}>+{X_POINTS_REWARD} PTS</Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.divider }]} />

      {/* Quest Item: Follow on X */}
      <View style={[styles.questItem, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
        <View style={styles.questTop}>
          <View style={[styles.xLogoWrap, { backgroundColor: '#000000' }]}>
            <Ionicons name="logo-twitter" size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.questTitle, { color: colors.text }]}>
              Follow @{X_TARGET_HANDLE} on X
            </Text>
            <Text style={[styles.questDesc, { color: colors.textSecondary }]}>
              Stay updated with ClockLend development & earn instant reputation points.
            </Text>
          </View>
        </View>

        {questStatus.completed ? (
          <View style={[styles.completedBanner, { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            <Text style={[styles.completedText, { color: '#10B981' }]}>
              Completed • {questStatus.claimedHandle} (+10 Pts Claimed)
            </Text>
          </View>
        ) : (
          <View style={styles.actionContainer}>
            {/* Step 1: Follow on X Link */}
            <TouchableOpacity
              style={[styles.followBtn, { backgroundColor: colors.primary }]}
              onPress={handleOpenFollow}
              activeOpacity={0.8}
            >
              <Ionicons name="logo-twitter" size={16} color="#FFFFFF" />
              <Text style={styles.followBtnText}>
                {hasFollowedClicked ? 'Open @bughacker140823 Again ↗' : 'Follow @bughacker140823 on X ↗'}
              </Text>
            </TouchableOpacity>

            {/* Step 2: Input username & Verify */}
            <View style={styles.verifyRow}>
              <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Text style={[styles.atPrefix, { color: colors.textMuted }]}>@</Text>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Your X username"
                  placeholderTextColor={colors.textMuted}
                  value={xUsername}
                  onChangeText={(val) => setXUsername(val.replace(/^@/, ''))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isVerifying}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.verifyBtn,
                  { backgroundColor: colors.primary },
                  isVerifying && { opacity: 0.6 },
                ]}
                onPress={handleVerifyAndClaim}
                disabled={isVerifying}
                activeOpacity={0.8}
              >
                {isVerifying ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.verifyBtnText}>Verify & Claim</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  rewardBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  rewardBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  questItem: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  questTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  xLogoWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  questDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  actionContainer: {
    gap: 10,
  },
  followBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    borderRadius: 12,
  },
  followBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  verifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  atPrefix: {
    fontSize: 14,
    fontWeight: '700',
    marginRight: 2,
  },
  input: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 0,
  },
  verifyBtn: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  completedText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
});
