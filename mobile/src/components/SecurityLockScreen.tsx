import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Image,
  Dimensions,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { authenticateDeviceLock } from '../services/securityService';

const { width } = Dimensions.get('window');
const LOGO_IMG = require('../../assets/logo.png');

export type LockScreenMode = 'unlock' | 'setup' | 'change_pin';

interface SecurityLockScreenProps {
  mode?: LockScreenMode;
  userName?: string;
  onUnlock: () => void;
  onCancel?: () => void;
}

export const SecurityLockScreen: React.FC<SecurityLockScreenProps> = ({
  mode = 'unlock',
  userName = 'Seeker',
  onUnlock,
  onCancel,
}) => {
  const { colors, mode: themeMode } = useTheme();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Subtle breathing pulse for the lock target
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);


  const triggerDeviceUnlock = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setErrorMsg('');
    try {
      const success = await authenticateDeviceLock('Unlock ClockLend');
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onUnlock();
      } else {
        setErrorMsg('Authentication cancelled or unrecognized. Tap to retry.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Device authentication failed. Tap to retry.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
      />

      {/* Top Header Row with Logo */}
      <View style={styles.topLogoRow}>
        <View style={styles.smallLogoWrapper}>
          <Image source={LOGO_IMG} style={styles.smallLogo} resizeMode="contain" />
        </View>
        {onCancel && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onCancel();
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Dismiss</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main Device Security Unlock Area */}
      <View style={styles.centerCard}>
        <Text style={[styles.helloTitle, { color: colors.text }]}>Hello, {userName}</Text>
        <Text style={[styles.subText, { color: colors.textSecondary }]}>
          Protected by device screen lock
        </Text>

        <TouchableOpacity
          onPress={triggerDeviceUnlock}
          activeOpacity={0.8}
          style={styles.lockRingWrapper}
        >
          <Animated.View
            style={[
              styles.lockRing,
              {
                transform: [{ scale: pulseAnim }],
                borderColor: colors.primary,
                backgroundColor: colors.badgeBg,
              },
            ]}
          >
            <Ionicons name="lock-closed" size={56} color={colors.primary} />
          </Animated.View>
        </TouchableOpacity>

        {errorMsg ? (
          <Text style={styles.errorText}>{errorMsg}</Text>
        ) : (
          <Text style={[styles.hintText, { color: colors.textMuted }]}>
            Enter device PIN, pattern, or password to unlock
          </Text>
        )}
      </View>

      {/* Bottom Action Button */}
      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={[
            styles.unlockBtn,
            {
              backgroundColor: colors.primary,
            },
          ]}
          onPress={triggerDeviceUnlock}
          disabled={isAuthenticating}
          activeOpacity={0.8}
        >
          {isAuthenticating ? (
            <ActivityIndicator size="small" color={colors.primaryText} />
          ) : (
            <>
              <Ionicons name="lock-open-outline" size={20} color={colors.primaryText} />
              <Text style={[styles.unlockBtnText, { color: colors.primaryText }]}>
                Unlock with Device Screen Lock
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 28) + 20 : 52,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  topLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    height: 48,
  },
  smallLogoWrapper: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallLogo: {
    width: '100%',
    height: '100%',
  },
  cancelBtn: {
    position: 'absolute',
    right: 0,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  centerCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  helloTitle: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  subText: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 44,
  },
  lockRingWrapper: {
    marginBottom: 32,
  },
  lockRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  hintText: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  bottomSection: {
    paddingBottom: 48,
  },
  unlockBtn: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  unlockBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
