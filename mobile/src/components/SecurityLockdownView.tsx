import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { terminateApplication, DeviceIntegrityResult } from '../services/securityService';

interface SecurityLockdownViewProps {
  integrity: DeviceIntegrityResult;
  onRetry?: () => void;
}

export const SecurityLockdownView: React.FC<SecurityLockdownViewProps> = ({ integrity, onRetry }) => {
  const { colors, mode } = useTheme();

  // Route passColor directly through the theme's success token.
  const passColor = colors.success;
  // Translucent danger wash behind the shield, tinted from `colors.danger`.
  const dangerTint = colors.isDark ? 'rgba(248, 113, 113, 0.16)' : 'rgba(220, 38, 38, 0.10)';
  // Solid fills carry `primaryText`, which must stay readable on the fill, so
  // the destructive CTA uses red-600 (white on it is 4.83:1) rather than
  // `colors.danger`, which is tuned for danger *text* on each theme's surfaces.
  const dangerFill = '#DC2626';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={mode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      <View style={styles.content}>
        {/* Glowing Shield Alert Icon */}
        <View style={styles.iconContainer}>
          <View style={[styles.iconGlow, { backgroundColor: dangerTint }]} />
          <View style={[styles.iconCircle, { backgroundColor: dangerTint, borderColor: colors.danger }]}>
            <Ionicons name="shield-half" size={54} color={colors.danger} />
          </View>
        </View>

        <Text style={[styles.title, { color: colors.danger }]}>SECURITY VIOLATION</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {integrity.violationReason || 'Virtualized or Compromised Runtime'}
        </Text>

        {/* Security Diagnostics Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.diagRow}>
            <View style={styles.diagLeft}>
              <Ionicons
                name={integrity.isEmulator ? 'close-circle' : 'checkmark-circle'}
                size={18}
                color={integrity.isEmulator ? colors.danger : passColor}
              />
              <Text style={[styles.diagLabel, { color: colors.text }]}>Physical Device Hardware</Text>
            </View>
            <Text style={[styles.diagStatus, { color: integrity.isEmulator ? colors.danger : passColor }]}>
              {integrity.isEmulator ? 'FAIL (Emulator)' : 'PASS'}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          <View style={styles.diagRow}>
            <View style={styles.diagLeft}>
              <Ionicons
                name={integrity.isRooted ? 'close-circle' : 'checkmark-circle'}
                size={18}
                color={integrity.isRooted ? colors.danger : passColor}
              />
              <Text style={[styles.diagLabel, { color: colors.text }]}>OS Integrity (Anti-Root)</Text>
            </View>
            <Text style={[styles.diagStatus, { color: integrity.isRooted ? colors.danger : passColor }]}>
              {integrity.isRooted ? 'FAIL (Rooted)' : 'PASS'}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          <View style={styles.diagRow}>
            <View style={styles.diagLeft}>
              <Ionicons
                name={integrity.isHooking ? 'close-circle' : 'checkmark-circle'}
                size={18}
                color={integrity.isHooking ? colors.danger : passColor}
              />
              <Text style={[styles.diagLabel, { color: colors.text }]}>Runtime Hooking (Anti-Frida)</Text>
            </View>
            <Text style={[styles.diagStatus, { color: integrity.isHooking ? colors.danger : passColor }]}>
              {integrity.isHooking ? 'FAIL (Injected)' : 'PASS'}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          <View style={styles.diagRow}>
            <View style={styles.diagLeft}>
              <Ionicons
                name={integrity.isDebugger ? 'close-circle' : 'checkmark-circle'}
                size={18}
                color={integrity.isDebugger ? colors.danger : passColor}
              />
              <Text style={[styles.diagLabel, { color: colors.text }]}>Process Debugger</Text>
            </View>
            <Text style={[styles.diagStatus, { color: integrity.isDebugger ? colors.danger : passColor }]}>
              {integrity.isDebugger ? 'FAIL (Attached)' : 'PASS'}
            </Text>
          </View>
        </View>

        {/* Security Policy Advisory */}
        <View style={[styles.advisoryBox, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}>
          <Ionicons
            name="information-circle-outline"
            size={18}
            color={colors.textSecondary}
            style={styles.advisoryIcon}
          />
          <Text style={[styles.advisoryText, { color: colors.textSecondary }]}>
            ClockLend is cryptographically locked to physical hardware (Solana Seeker). To protect escrow contracts, borrower collateral, and private key safety, execution is barred on virtualized simulators and tampered operating systems.
          </Text>
        </View>

        {/* Actions */}
        {onRetry && (
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }]}
            activeOpacity={0.8}
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Re-check environment"
          >
            <Ionicons name="refresh-outline" size={18} color={colors.text} style={{ marginRight: 8 }} />
            <Text style={[styles.retryButtonText, { color: colors.text }]}>Re-check Hardware Environment</Text>
          </TouchableOpacity>
        )}

        {/* Exit Button */}
        <TouchableOpacity
          style={[styles.exitButton, { backgroundColor: dangerFill }]}
          activeOpacity={0.8}
          onPress={() => terminateApplication()}
          accessibilityRole="button"
          accessibilityLabel="Terminate application"
        >
          <Ionicons name="power-outline" size={20} color={colors.primaryText} style={{ marginRight: 8 }} />
          <Text style={[styles.exitButtonText, { color: colors.primaryText }]}>Terminate Application</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Colours in this sheet are applied from the theme at the call site so the
  // lockdown screen follows the light/dark toggle like the rest of the app.
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  iconCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 28,
  },
  card: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  diagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  diagLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  diagLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 10,
  },
  diagStatus: {
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: 1,
  },
  advisoryBox: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 28,
  },
  advisoryIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  advisoryText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  retryButton: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  exitButton: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
