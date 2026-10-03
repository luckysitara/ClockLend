import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  BackHandler,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { VersionGateResult, openDAppStore } from '../services/versionGateService';

interface ForceUpdateModalProps {
  visible: boolean;
  versionInfo: VersionGateResult | null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const ForceUpdateModal: React.FC<ForceUpdateModalProps> = ({
  visible,
  versionInfo,
}) => {
  const { colors, mode } = useTheme();

  // Intercept and block Android hardware back press so the modal cannot be bypassed
  useEffect(() => {
    if (!visible) return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch {}
      return true; // Consume event to prevent back navigation
    });

    return () => backHandler.remove();
  }, [visible]);

  if (!visible || !versionInfo) return null;

  const title = versionInfo.config?.title || 'Update Required';
  const message =
    versionInfo.config?.message ||
    'A newer version of ClockLend is available on the Solana dApp Store. Please update to continue using the protocol.';
  const requiredVer = versionInfo.minimumVersion || '1.0.1';
  const installedVer = versionInfo.installedVersion || '1.0.0';

  const handleUpdatePress = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    await openDAppStore(versionInfo.config?.dappStoreUrl);
  };

  return (
    <Modal visible={visible} transparent={false} animationType="fade">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.cardContainer}>
          {/* Logo & Icon Badge */}
          <View style={styles.iconWrapper}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <View style={[styles.badgeCircle, { backgroundColor: '#EF4444' }]}>
              <Ionicons name="arrow-up" size={16} color="#FFFFFF" />
            </View>
          </View>

          {/* Title & Description */}
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

          {/* Version Comparison Tag */}
          <View style={[styles.versionBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
            <View style={styles.versionCol}>
              <Text style={[styles.versionLabel, { color: colors.textMuted }]}>CURRENT</Text>
              <Text style={[styles.versionValue, { color: colors.text }]}>v{installedVer}</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={colors.primary} />
            <View style={styles.versionCol}>
              <Text style={[styles.versionLabel, { color: colors.primaryLabel }]}>REQUIRED</Text>
              <Text style={[styles.versionValue, { color: colors.primary }]}>v{requiredVer}</Text>
            </View>
          </View>

          {/* Seeker dApp Store Callout */}
          <View style={[styles.calloutCard, { backgroundColor: colors.badgeBg, borderColor: colors.badgeBorder }]}>
            <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
            <Text style={[styles.calloutText, { color: colors.primaryLabel }]}>
              Verified Release on Solana Seeker dApp Store
            </Text>
          </View>

          {/* Update Action Button */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleUpdatePress}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={mode === 'dark' ? ['#172554', '#1E40AF', '#2563EB'] : ['#1E3A8A', '#1D4ED8', '#2563EB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btnGradient}
            >
              <Ionicons name="download-outline" size={20} color="#FFFFFF" />
              <Text style={styles.btnText}>Update in Solana dApp Store</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Secondary Web Fallback Link */}
          <TouchableOpacity
            onPress={() => openDAppStore(versionInfo.config?.webUrl)}
            style={styles.secondaryBtn}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.textMuted }]}>
              Open in Browser ↗
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  iconWrapper: {
    position: 'relative',
    marginBottom: 24,
  },
  logoImage: {
    width: 80,
    height: 80,
  },
  badgeCircle: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  versionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  versionCol: {
    alignItems: 'center',
  },
  versionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  versionValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  calloutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 28,
  },
  calloutText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionBtn: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 14,
  },
  btnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
