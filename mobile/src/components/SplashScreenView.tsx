import React, { useEffect, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
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
  const logoTranslateX = useRef(new Animated.Value(-width * 0.75)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(1)).current;

  const textTranslateX = useRef(new Animated.Value(width * 0.75)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  const exitOpacity = useRef(new Animated.Value(1)).current;

  const textWidthRef = useRef(162);
  const hasFinishedRef = useRef(false);

  const finishEarly = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    onFinish();
  };

  useEffect(() => {
    const shiftAmount = (textWidthRef.current + 14) / 2;

    const anim = Animated.sequence([
      // 1. Entrance: Logo & text glide in simultaneously from left and right side-by-side
      Animated.parallel([
        Animated.timing(logoTranslateX, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateX, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
      ]),

      // 2. Pause to display side-by-side lockup
      Animated.delay(400),

      // 3. Text disappears after sliding, and logo centers
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 0,
          duration: 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateX, {
          toValue: 30,
          duration: 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoTranslateX, {
          toValue: shiftAmount,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),

      // 4. Scale up to 15x and smoothly transition to dissolve into the app
      Animated.parallel([
        Animated.timing(logoScale, {
          toValue: 15,
          duration: 550,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(220),
          Animated.timing(exitOpacity, {
            toValue: 0,
            duration: 330,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
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
        {/* Side-by-side row: Logo on left, Logo text ("ClockLend") on right */}
        <View style={styles.sideBySideRow}>
          {/* Animated Brand Logo */}
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

          {/* Animated Brand Text ("ClockLend" only, no tagline) */}
          <Animated.View
            style={[
              styles.textWrapper,
              {
                opacity: textOpacity,
                transform: [{ translateX: textTranslateX }],
              },
            ]}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0) {
                textWidthRef.current = w;
              }
            }}
          >
            <Text style={[styles.brandTitle, { color: colors.text }]}>ClockLend</Text>
          </Animated.View>
        </View>
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
  },
  sideBySideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: {
    width: 76,
    height: 76,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  textWrapper: {
    marginLeft: 14,
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
