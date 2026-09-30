import React, { createContext, useContext, useState } from 'react';

export type ThemeMode = 'dark' | 'light';

export interface ThemeColors {
  isDark: boolean;
  background: string;
  card: string;
  cardAlt: string;
  cardBorder: string;
  primary: string;
  primaryText: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  danger: string;
  warning: string;
  /** Success/positive state. Added because success greens were hard-coded
   *  per-component, and several were unreadable on the light theme. */
  success: string;
  /** Accessible primary text token for labels/text on background or card surfaces.
   *  WCAG AA passing (dark: #818CF8 = 5.60:1; light: #4F46E5 = 7.40:1). */
  primaryLabel: string;
  badgeBg: string;
  badgeBorder: string;
  inputBg: string;
  inputBorder: string;
  divider: string;
}

// Dark palette, rebalanced so the app is comfortable to read on an OLED phone at
// night rather than a near-black void with near-white text on it.
//
//   * background lum 0.004 -> 0.013 (a soft navy, not a void)
//   * `text` on background 18.6:1 -> 13.1:1 (still AAA; AA is 4.5:1)
//   * background -> card step widened so surfaces read as raised on their own,
//     with cardBorder/divider/inputBorder alpha raised to hold their old edge
// Dark palette: Pitch black OLED background (#000000) with premium dark grey
// surface cards (#121214 / #1B1C20), crisp pure white headings (#FFFFFF), and
// balanced zinc/neutral grey secondary typography (#A1A1AA / #71717A).
const darkColors: ThemeColors = {
  isDark: true,
  background: '#000000',
  card: '#121214',
  cardAlt: '#1B1C20',
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  primary: '#3B82F6',
  primaryText: '#FFFFFF',
  primaryLabel: '#60A5FA',
  text: '#FFFFFF',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
  accent: '#2563EB',
  accentLight: '#93C5FD',
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#10B981',
  badgeBg: 'rgba(255, 255, 255, 0.08)',
  badgeBorder: 'rgba(255, 255, 255, 0.12)',
  inputBg: '#16171B',
  inputBorder: 'rgba(255, 255, 255, 0.12)',
  divider: 'rgba(255, 255, 255, 0.07)',
};

const lightColors: ThemeColors = {
  isDark: false,
  background: '#F8FAFC',
  card: '#FFFFFF',
  cardAlt: '#F1F5F9',
  cardBorder: '#E2E8F0',
  primary: '#1D4ED8',
  primaryText: '#FFFFFF',
  primaryLabel: '#1E40AF',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  accent: '#2563EB',
  accentLight: '#DBEAFE',
  danger: '#DC2626',
  warning: '#D97706',
  success: '#10B981',
  badgeBg: 'rgba(29, 78, 216, 0.08)',
  badgeBorder: 'rgba(29, 78, 216, 0.20)',
  inputBg: '#FFFFFF',
  inputBorder: '#CBD5E1',
  divider: '#E2E8F0',
};

interface ThemeContextType {
  mode: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  colors: lightColors,
  toggleTheme: () => {},
  setTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>('light');

  const toggleTheme = () => {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const colors = mode === 'dark' ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ mode, colors, toggleTheme, setTheme: setMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
