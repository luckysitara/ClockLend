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
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import {
  getUserPin,
  setUserPin,
  verifyUserPin,
  getLockoutRemaining,
  recordFailedAttempt,
  resetFailedAttempts,
  isPinConfigured,
  isBiometricsEnabled,
  checkBiometricHardware,
  authenticateWithBiometrics,
} from '../services/securityService';

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

  // Screen State
  const [currentMode, setCurrentMode] = useState<LockScreenMode>(mode);
  const [step, setStep] = useState<'enter_current' | 'enter_new' | 'confirm_new' | 'unlock'>('unlock');
  const [pin, setPin] = useState<string>('');
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);
  const [firstEnteredPin, setFirstEnteredPin] = useState<string>('');
  const [hasBiometrics, setHasBiometrics] = useState<boolean>(false);
  const [biometricsActive, setBiometricsActive] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [showKeypad, setShowKeypad] = useState<boolean>(false);

  // Animations
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    initSecurity();
  }, [mode]);

  useEffect(() => {
    // Subtle pulse for biometric ring
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setErrorMsg('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const initSecurity = async () => {
    const remaining = await getLockoutRemaining();
    if (remaining > 0) {
      setLockoutSeconds(remaining);
      setErrorMsg(`Device temporarily locked. Retry in ${remaining}s.`);
      setShowKeypad(true);
    }

    const pinConfigured = await isPinConfigured();

    if (mode === 'unlock' && !pinConfigured) {
      setCurrentMode('setup');
      setStep('enter_new');
      setShowKeypad(true);
      return;
    }

    if (mode === 'setup') {
      setCurrentMode('setup');
      setStep('enter_new');
      setShowKeypad(true);
      return;
    }

    if (mode === 'change_pin') {
      setCurrentMode('change_pin');
      setStep('enter_current');
      setShowKeypad(true);
      return;
    }

    setCurrentMode('unlock');
    setStep('unlock');

    const { hasHardware, isEnrolled } = await checkBiometricHardware();
    const bioPref = await isBiometricsEnabled();
    const canUseBio = hasHardware && isEnrolled && bioPref;
    setHasBiometrics(hasHardware && isEnrolled);
    setBiometricsActive(canUseBio);

    if (canUseBio && remaining === 0) {
      // Auto-prompt biometrics like 09802503 reference
      setShowKeypad(false);
      setTimeout(() => {
        triggerBiometric();
      }, 350);
    } else {
      setShowKeypad(true);
    }
  };

  const triggerBiometric = async () => {
    if (lockoutSeconds > 0) return;
    const success = await authenticateWithBiometrics('Unlock ClockLend');
    if (success) {
      await resetFailedAttempts();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onUnlock();
    }
  };

  const shake = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleKeyPress = async (digit: string) => {
    if (lockoutSeconds > 0) return;
    if (pin.length >= 4) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const newPin = pin + digit;
    setPin(newPin);
    setErrorMsg('');

    if (newPin.length === 4) {
      setTimeout(() => processPin(newPin), 80);
    }
  };

  const processPin = async (inputPin: string) => {
    if (currentMode === 'unlock') {
      const valid = await verifyUserPin(inputPin);
      if (valid) {
        await resetFailedAttempts();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onUnlock();
      } else {
        shake();
        const res = await recordFailedAttempt();
        if (res.locked && res.remainingSeconds > 0) {
          setLockoutSeconds(res.remainingSeconds);
          setErrorMsg(`3 failed attempts reached. Device locked for ${res.remainingSeconds}s.`);
        } else {
          const remainingAttempts = Math.max(0, 3 - res.attempts);
          setErrorMsg(`Incorrect PIN. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`);
        }
        setTimeout(() => setPin(''), 400);
      }
    } else if (currentMode === 'setup') {
      if (step === 'enter_new') {
        setFirstEnteredPin(inputPin);
        setPin('');
        setStep('confirm_new');
      } else if (step === 'confirm_new') {
        if (inputPin === firstEnteredPin) {
          await setUserPin(inputPin);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setTimeout(() => onUnlock(), 150);
        } else {
          shake();
          setErrorMsg('PINs do not match. Try again.');
          setTimeout(() => {
            setPin('');
            setStep('enter_new');
            setFirstEnteredPin('');
          }, 450);
        }
      }
    } else if (currentMode === 'change_pin') {
      if (step === 'enter_current') {
        const valid = await verifyUserPin(inputPin);
        if (valid) {
          setPin('');
          setStep('enter_new');
        } else {
          shake();
          setErrorMsg('Current PIN incorrect.');
          setTimeout(() => setPin(''), 400);
        }
      } else if (step === 'enter_new') {
        setFirstEnteredPin(inputPin);
        setPin('');
        setStep('confirm_new');
      } else if (step === 'confirm_new') {
        if (inputPin === firstEnteredPin) {
          await setUserPin(inputPin);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setTimeout(() => onUnlock(), 150);
        } else {
          shake();
          setErrorMsg('PINs do not match. Try again.');
          setTimeout(() => {
            setPin('');
            setStep('enter_new');
            setFirstEnteredPin('');
          }, 450);
        }
      }
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setPin(pin.slice(0, -1));
      setErrorMsg('');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: themeMode === 'dark' ? '#0B0E17' : '#FFFFFF' }]}>
      {/* Top Header Logo */}
      <View style={styles.topLogoRow}>
        <View style={styles.smallLogoWrapper}>
          <Image source={LOGO_IMG} style={styles.smallLogo} resizeMode="contain" />
        </View>
        {onCancel && (
          <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
              {currentMode === 'setup' ? 'Skip' : 'Cancel'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main Lock Screen Mode 1: Clean Biometric (09802503 Reference) */}
      {!showKeypad && currentMode === 'unlock' ? (
        <View style={styles.biometricScreen}>
          <Text style={[styles.helloTitle, { color: themeMode === 'dark' ? '#F1F5F9' : '#1C1917' }]}>
            Hello, {userName}
          </Text>

          {/* Golden Biometric Ring */}
          <TouchableOpacity
            style={styles.biometricRingContainer}
            onPress={triggerBiometric}
            activeOpacity={0.8}
          >
            <Animated.View
              style={[
                styles.biometricRing,
                {
                  transform: [{ scale: pulseAnim }],
                  borderColor: colors.primary,
                  backgroundColor: colors.badgeBg,
                },
              ]}
            >
              <Ionicons name="finger-print" size={56} color={colors.primary} />
            </Animated.View>
          </TouchableOpacity>

          {/* Bottom Card Button: Unlock with PIN */}
          <TouchableOpacity
            style={[
              styles.unlockPinBtn,
              {
                backgroundColor: themeMode === 'dark' ? '#1A1C22' : '#FFFFFF',
                borderColor: colors.cardBorder,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setShowKeypad(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.unlockPinText, { color: themeMode === 'dark' ? '#F1F5F9' : '#1C1917' }]}>
              Unlock with PIN
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* Main Lock Screen Mode 2: Tactile 4-Digit Numeric Keypad */
        <View style={styles.keypadScreen}>
          <Text style={[styles.helloTitle, { color: themeMode === 'dark' ? '#F1F5F9' : '#1C1917', marginBottom: 6 }]}>
            {currentMode === 'setup'
              ? step === 'confirm_new'
                ? 'Confirm Your PIN'
                : 'Create 4-Digit PIN'
              : currentMode === 'change_pin'
              ? step === 'enter_current'
                ? 'Enter Current PIN'
                : step === 'confirm_new'
                ? 'Confirm New PIN'
                : 'Enter New PIN'
              : `Hello, ${userName}`}
          </Text>

          <Text style={[styles.subText, { color: colors.textSecondary }]}>
            {currentMode === 'unlock'
              ? 'Enter your 4-digit security PIN'
              : 'Choose a PIN for device & Seed Vault security'}
          </Text>

          {/* 4 Golden Indicator Dots */}
          <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[0, 1, 2, 3].map((i) => {
              const filled = pin.length > i;
              return (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      borderColor: filled ? colors.primary : colors.cardBorder,
                      backgroundColor: filled ? colors.primary : colors.cardAlt,
                    },
                  ]}
                />
              );
            })}
          </Animated.View>

          {errorMsg ? (
            <Text style={styles.errorText}>{errorMsg}</Text>
          ) : (
            <View style={{ height: 20 }} />
          )}

          {/* Numeric Keypad */}
          <View style={styles.keypad}>
            {[
              ['1', '2', '3'],
              ['4', '5', '6'],
              ['7', '8', '9'],
              ['bio', '0', 'del'],
            ].map((row, rIdx) => (
              <View key={rIdx} style={styles.keyRow}>
                {row.map((k) => {
                  if (k === 'bio') {
                    if (currentMode === 'unlock' && biometricsActive) {
                      return (
                        <TouchableOpacity
                          key={k}
                          style={styles.keyBtn}
                          onPress={triggerBiometric}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="finger-print" size={28} color={colors.primary} />
                        </TouchableOpacity>
                      );
                    }
                    return <View key={k} style={styles.keyBtn} />;
                  }

                  if (k === 'del') {
                    return (
                      <TouchableOpacity
                        key={k}
                        style={styles.keyBtn}
                        onPress={handleDelete}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="backspace-outline"
                          size={24}
                          color={themeMode === 'dark' ? '#F1F5F9' : '#1C1917'}
                        />
                      </TouchableOpacity>
                    );
                  }

                  return (
                    <TouchableOpacity
                      key={k}
                      style={[
                        styles.keyBtn,
                        {
                          backgroundColor: themeMode === 'dark' ? '#1A1C22' : '#FFFFFF',
                          borderColor: colors.cardBorder,
                        },
                      ]}
                      onPress={() => handleKeyPress(k)}
                      activeOpacity={0.65}
                    >
                      <Text
                        style={[
                          styles.keyText,
                          { color: themeMode === 'dark' ? '#F1F5F9' : '#1C1917' },
                        ]}
                      >
                        {k}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 28) + 20 : 52,
    paddingHorizontal: 24,
  },
  topLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    height: 48,
    marginBottom: 40,
  },
  smallLogoWrapper: {
    width: 36,
    height: 36,
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
  biometricScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 60,
  },
  helloTitle: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  biometricRingContainer: {
    marginVertical: 'auto',
  },
  biometricRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unlockPinBtn: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  unlockPinText: {
    fontSize: 16,
    fontWeight: '700',
  },
  keypadScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  subText: {
    fontSize: 14,
    marginBottom: 28,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 16,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  keypad: {
    width: width * 0.78,
    maxWidth: 320,
    gap: 16,
    marginTop: 10,
  },
  keyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  keyBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyText: {
    fontSize: 26,
    fontWeight: '700',
  },
});
