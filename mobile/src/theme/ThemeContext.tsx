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
//   * danger lightened to #F87171 so it stays >= 4.5:1 on every surface
//
// Every value here is checked in docs/APP_UI_INVENTORY.md 6.1 — do not hand-tune
// a token without recomputing its WCAG ratio against background/card/cardAlt.
const darkColors: ThemeColors = {
  isDark: true,
  background: '#121316',
  card: '#1A1C22',
  cardAlt: '#24262E',
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  primary: '#F59E0B',
  primaryText: '#000000',
  primaryLabel: '#FBBF24',
  text: '#F3F4F6',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  accent: '#F59E0B',
  accentLight: '#FDE68A',
  danger: '#F87171',
  warning: '#F59E0B',
  success: '#10B981',
  badgeBg: 'rgba(245, 158, 11, 0.14)',
  badgeBorder: 'rgba(245, 158, 11, 0.30)',
  inputBg: '#181A20',
  inputBorder: 'rgba(255, 255, 255, 0.08)',
  divider: 'rgba(255, 255, 255, 0.06)',
};

const lightColors: ThemeColors = {
  isDark: false,
  background: '#F7F5F0',
  card: '#FFFFFF',
  cardAlt: '#EFECE4',
  cardBorder: '#E8E3D8',
  primary: '#D97706',
  primaryText: '#FFFFFF',
  primaryLabel: '#B45309',
  text: '#1C1917',
  textSecondary: '#78716C',
  textMuted: '#A8A29E',
  accent: '#D97706',
  accentLight: '#FEF3C7',
  danger: '#DC2626',
  warning: '#D97706',
  success: '#10B981',
  badgeBg: 'rgba(217, 119, 6, 0.10)',
  badgeBorder: 'rgba(217, 119, 6, 0.22)',
  inputBg: '#FFFFFF',
  inputBorder: '#E8E3D8',
  divider: '#ECE7DE',
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
