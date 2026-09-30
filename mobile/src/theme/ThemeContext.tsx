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
//   * danger lightened to #F87171 so it stays >= 4.5:1 on every surface
//
// Every value here is checked in docs/APP_UI_INVENTORY.md 6.1 — do not hand-tune
// a token without recomputing its WCAG ratio against background/card/cardAlt.
const darkColors: ThemeColors = {
  isDark: true,
  background: '#171E2B',
  card: '#202838',
  cardAlt: '#242E42',
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  primary: '#6366F1',
  primaryText: '#FFFFFF',
  text: '#DEE4EE',
  textSecondary: '#B6C1D2',
  textMuted: '#95A3B8',
  accent: '#38BDF8',
  accentLight: '#7DD3FC',
  danger: '#F87171',
  warning: '#F59E0B',
  success: '#4ADE80',
  badgeBg: 'rgba(99, 102, 241, 0.14)',
  badgeBorder: 'rgba(99, 102, 241, 0.28)',
  inputBg: '#1B2230',
  inputBorder: 'rgba(255, 255, 255, 0.09)',
  divider: 'rgba(255, 255, 255, 0.07)',
};

const lightColors: ThemeColors = {
  isDark: false,
  background: '#F8FAFC',
  card: '#FFFFFF',
  cardAlt: '#F1F5F9',
  cardBorder: '#E2E8F0',
  primary: '#572DFD',
  primaryText: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  accent: '#0284C7',
  accentLight: '#38BDF8',
  danger: '#DC2626',
  warning: '#D97706',
  success: '#15803D',
  badgeBg: 'rgba(87, 45, 253, 0.08)',
  badgeBorder: 'rgba(87, 45, 253, 0.20)',
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
