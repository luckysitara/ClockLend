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
  badgeBg: string;
  badgeBorder: string;
  inputBg: string;
  inputBorder: string;
  divider: string;
}

const darkColors: ThemeColors = {
  isDark: true,
  background: '#0B0E14',
  card: '#131722',
  cardAlt: '#1A202E',
  cardBorder: 'rgba(255, 255, 255, 0.07)',
  primary: '#6366F1',
  primaryText: '#FFFFFF',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  accent: '#38BDF8',
  accentLight: '#7DD3FC',
  danger: '#EF4444',
  warning: '#F59E0B',
  badgeBg: 'rgba(99, 102, 241, 0.12)',
  badgeBorder: 'rgba(99, 102, 241, 0.22)',
  inputBg: '#0E121A',
  inputBorder: 'rgba(255, 255, 255, 0.09)',
  divider: 'rgba(255, 255, 255, 0.06)',
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
