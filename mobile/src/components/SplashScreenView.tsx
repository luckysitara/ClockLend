import React, { useEffect, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  Text,
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
  const logoScale = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(14)).current;
  const exitScale = useRef(new Animated.Value(1)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;

  const hasFinishedRef = useRef(false);

  const finishEarly = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    onFinish();
  };

  useEffect(() => {
    // 1. Initial fade in (350ms)
    Animated.timing(logoOpacity, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start(() => {
      // 2. Pulse 1 (expand to 1.25 then return to 1.0)
      Animated.sequence([
        Animated.timing(logoScale, {
          toValue: 1.25,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1.0,
          duration: 280,
          useNativeDriver: true,
        }),
        // 3. Pulse 2 (expand to 1.28 then return to 1.0)
        Animated.timing(logoScale, {
          toValue: 1.28,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1.0,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // 4. Reveal logo text ("ClockLend" + tagline)
        Animated.parallel([
          Animated.timing(textOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(textTranslateY, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]).start(() => {
          // 5. Brief hold so logo + text lockup is fully visible, then smooth exit
          const timer = setTimeout(() => {
            Animated.parallel([
              Animated.timing(exitOpacity, {
                toValue: 0,
                duration: 350,
                useNativeDriver: true,
              }),
              Animated.timing(exitScale, {
                toValue: 1.08,
                duration: 350,
                useNativeDriver: true,
              }),
            ]).start(() => {
              finishEarly();
            });
          }, 650);

          return () => clearTimeout(timer);
        });
      });
    });
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
          styles.contentWrapper,
          {
            opacity: exitOpacity,
            transform: [{ scale: exitScale }],
          },
        ]}
      >
        {/* Animated Brand Logo */}
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

        {/* Animated Brand Text Lockup */}
        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: textOpacity,
              transform: [{ translateY: textTranslateY }],
            },
          ]}
        >
          <Text style={[styles.brandTitle, { color: colors.text }]}>ClockLend</Text>
          <Text style={[styles.brandTagline, { color: colors.primaryLabel }]}>
            Decentralized Liquidity
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
  contentWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: {
    width: 116,
    height: 116,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  brandTagline: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 6,
  },
});
