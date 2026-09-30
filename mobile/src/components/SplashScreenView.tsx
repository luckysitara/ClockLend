import React, { useEffect, useRef } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Image,
  Text,
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
  const logoScale = useRef(new Animated.Value(0.75)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoTranslateX = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateX = useRef(new Animated.Value(15)).current;
  const exitScale = useRef(new Animated.Value(1)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;

  const hasFinishedRef = useRef(false);

  const finishEarly = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    onFinish();
  };

  useEffect(() => {
    // 1. Initial Icon entrance (matches 932b78b0 icon splash)
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 7,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Reveal brand text lockup (matches b5644ebd brand lockup splash)
    const textTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(logoTranslateX, {
          toValue: -8,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateX, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
      ]).start();
    }, 550);

    // 3. Smooth exit transition into main shell
    const exitTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(exitOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(exitScale, {
          toValue: 1.08,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        finishEarly();
      });
    }, 1800);

    return () => {
      clearTimeout(textTimer);
      clearTimeout(exitTimer);
    };
  }, []);

  return (
    <Pressable
      style={[
        styles.container,
        { backgroundColor: mode === 'dark' ? '#121316' : '#F7F5F0' },
      ]}
      onPress={finishEarly}
      accessibilityRole="button"
      accessibilityLabel="Skip splash screen"
    >
      <Animated.View
        style={[
          styles.brandContainer,
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
              transform: [
                { scale: logoScale },
                { translateX: logoTranslateX },
              ],
            },
          ]}
        >
          <Image source={LOGO_IMG} style={styles.logo} resizeMode="contain" />
        </Animated.View>

        <Animated.View
          style={[
            styles.textWrapper,
            {
              opacity: textOpacity,
              transform: [{ translateX: textTranslateX }],
            },
          ]}
        >
          <Text
            style={[
              styles.brandTitle,
              { color: mode === 'dark' ? '#F1F5F9' : '#1C1917' },
            ]}
          >
            ClockLend
          </Text>
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
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  textWrapper: {
    marginLeft: 8,
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
});
