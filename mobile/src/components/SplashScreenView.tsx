import React, { useEffect, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  Image,
  Animated,
  Dimensions,
  Easing,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const { width } = Dimensions.get('window');
const LOGO_IMG = require('../../assets/logo.png');

interface SplashScreenViewProps {
  onFinish: () => void;
}

export const SplashScreenView: React.FC<SplashScreenViewProps> = ({ onFinish }) => {
  const { colors } = useTheme();

  // Animations
  const logoTranslateX = useRef(new Animated.Value(-width * 0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(1)).current;

  const textTranslateX = useRef(new Animated.Value(width * 0.7)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  const exitOpacity = useRef(new Animated.Value(1)).current;

  const hasFinishedRef = useRef(false);

  const finishEarly = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    onFinish();
  };

  useEffect(() => {
    // Sequence:
    // 1. Logo & logo text come from left and right respectively
    // 2. Pause so user sees both together
    // 3. Logo text disappears
    // 4. Logo becomes big
    // 5. Logo pulses once, very big, starting the app
    const anim = Animated.sequence([
      // 1. Entrance from left and right
      Animated.parallel([
        Animated.timing(logoTranslateX, {
          toValue: 0,
          duration: 550,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateX, {
          toValue: 0,
          duration: 550,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),

      // 2. Pause to display lockup
      Animated.delay(420),

      // 3. Logo text disappears
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 0,
          duration: 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateX, {
          toValue: 35,
          duration: 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),

      // 4. Leaving the logo to be big
      Animated.timing(logoScale, {
        toValue: 1.5,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),

      // 5. And pulse once, very big
      Animated.timing(logoScale, {
        toValue: 2.75,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),

      // 6. Starting the app: settle and fade out into the main screen
      Animated.parallel([
        Animated.timing(logoScale, {
          toValue: 2.3,
          duration: 250,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(exitOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]),
    ]);

    anim.start(({ finished }) => {
      if (finished) {
        finishEarly();
      }
    });

    return () => {
      anim.stop();
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
          styles.contentWrapper,
          {
            opacity: exitOpacity,
          },
        ]}
      >
        {/* Animated Brand Logo (enters from left, stays centered, scales big, pulses very big) */}
        <Animated.View
          style={[
            styles.logoWrapper,
            {
              opacity: logoOpacity,
              transform: [
                { translateX: logoTranslateX },
                { scale: logoScale },
              ],
            },
          ]}
        >
          <Image source={LOGO_IMG} style={styles.logo} resizeMode="contain" />
        </Animated.View>

        {/* Animated Brand Text Lockup (enters from right, disappears) */}
        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: textOpacity,
              transform: [{ translateX: textTranslateX }],
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
    overflow: 'hidden',
  },
  contentWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 116,
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
    position: 'absolute',
    top: 134,
    width: '100%',
    alignItems: 'center',
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
