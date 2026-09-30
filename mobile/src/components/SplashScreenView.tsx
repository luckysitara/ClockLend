import React, { useEffect, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Image,
  Animated,
  Dimensions,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const { width } = Dimensions.get('window');
const LOGO_IMG = require('../../assets/logo.png');

interface SplashScreenViewProps {
  onFinish: () => void;
}

export const SplashScreenView: React.FC<SplashScreenViewProps> = ({ onFinish }) => {
  const { colors, mode } = useTheme();

  // Animations
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const exitScale = useRef(new Animated.Value(1)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;

  const hasFinishedRef = useRef(false);

  const finishEarly = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    onFinish();
  };

  useEffect(() => {
    // 1. Initial Icon entrance: spring scale + smooth fade in
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 35,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Subtle breath pulse
    const pulseTimer = setTimeout(() => {
      Animated.timing(logoScale, {
        toValue: 1.06,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }, 700);

    // 3. Smooth exit transition into main shell
    const exitTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(exitOpacity, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(exitScale, {
          toValue: 1.15,
          duration: 350,
          useNativeDriver: true,
        }),
      ]).start(() => {
        finishEarly();
      });
    }, 1800);

    return () => {
      clearTimeout(pulseTimer);
      clearTimeout(exitTimer);
    };
  }, []);

  return (
    <Pressable
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
      onPress={finishEarly}
      accessibilityRole="button"
      accessibilityLabel="Skip splash screen"
    >
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: exitOpacity,
            transform: [{ scale: exitScale }],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.logoWrapper,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image source={LOGO_IMG} style={styles.logo} resizeMode="contain" />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: {
    width: 108,
    height: 108,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
});
