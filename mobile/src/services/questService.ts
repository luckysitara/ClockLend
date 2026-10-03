import * as SecureStore from 'expo-secure-store';
import { Linking } from 'react-native';

export const X_TARGET_HANDLE = 'bughacker140823';
export const X_TARGET_URL = `https://x.com/${X_TARGET_HANDLE}`;
export const X_POINTS_REWARD = 10; // 10 points = 1000 bps reputation score
export const X_REPUTATION_BPS_REWARD = 1000;

const QUEST_KEY_PREFIX = 'clocklend_quest_x_bughacker_';

export interface QuestStatus {
  completed: boolean;
  claimedHandle?: string;
  claimedAt?: number;
  points: number;
}

/**
 * Open X / Twitter directly to the account profile
 */
export async function openXProfile(): Promise<void> {
  const nativeTwitterUri = `twitter://user?screen_name=${X_TARGET_HANDLE}`;
  try {
    const canOpen = await Linking.canOpenURL(nativeTwitterUri);
    if (canOpen) {
      await Linking.openURL(nativeTwitterUri);
      return;
    }
  } catch {
    // Fall back to web URL
  }
  await Linking.openURL(X_TARGET_URL).catch(() => {});
}

/**
 * Check if the current connected wallet has completed the X follow quest
 */
export async function getXQuestStatus(userPubkey: string): Promise<QuestStatus> {
  if (!userPubkey) return { completed: false, points: 0 };

  try {
    const raw = await SecureStore.getItemAsync(`${QUEST_KEY_PREFIX}${userPubkey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.completed) {
        return {
          completed: true,
          claimedHandle: parsed.claimedHandle,
          claimedAt: parsed.claimedAt,
          points: X_POINTS_REWARD,
        };
      }
    }
  } catch (err) {
    console.warn('[QuestService] Error loading quest status:', err);
  }

  return { completed: false, points: 0 };
}

/**
 * Verify and claim the 10 points reward
 */
export async function claimXQuest(
  userPubkey: string,
  userXHandle: string
): Promise<{ success: boolean; error?: string }> {
  if (!userPubkey) return { success: false, error: 'Wallet not connected' };

  const cleanHandle = userXHandle.trim().replace(/^@/, '');
  if (cleanHandle.length < 2) {
    return { success: false, error: 'Please enter a valid X username.' };
  }

  // Prevent users from entering the target account handle itself as their own username
  if (cleanHandle.toLowerCase() === X_TARGET_HANDLE.toLowerCase()) {
    return { success: false, error: 'Please enter YOUR X username to verify.' };
  }

  try {
    const record = {
      completed: true,
      claimedHandle: `@${cleanHandle}`,
      claimedAt: Date.now(),
      target: X_TARGET_HANDLE,
    };
    await SecureStore.setItemAsync(
      `${QUEST_KEY_PREFIX}${userPubkey}`,
      JSON.stringify(record)
    );
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Could not record quest completion.' };
  }
}
