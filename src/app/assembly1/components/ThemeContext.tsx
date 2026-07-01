'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light';

export interface ThemeConfig {
  mode: ThemeMode;
  // Header
  headerBg: string;
  headerSurface: string;
  headerBorderColor: string;
  headerText: string;
  headerMuted: string;
  // Body / children
  bodyBg: string;
  bodyText: string;
  bodyMuted: string;
  bodySurface: string;
  bodyBorder: string;
}

export const THEMES: Record<ThemeMode, ThemeConfig> = {
  dark: {
    mode: 'dark',
    headerBg: '#0b0f14',
    headerSurface: '#151b23',
    headerBorderColor: '#2a3441',
    headerText: '#f8fafc',
    headerMuted: '#a8b3c2',
    bodyBg: '#0b0f14',
    bodyText: '#f8fafc',
    bodyMuted: '#a8b3c2',
    bodySurface: '#151b23',
    bodyBorder: '#2a3441',
  },
  light: {
    mode: 'light',
    headerBg: '#ffffff',
    headerSurface: '#f1f5f9',
    headerBorderColor: '#e2e8f0',
    headerText: '#1f2937',
    headerMuted: '#64748b',
    bodyBg: '#ffffff',
    bodyText: '#1f2937',
    bodyMuted: '#64748b',
    bodySurface: '#f8fafc',
    bodyBorder: '#e2e8f0',
  },
};

interface ThemeContextValue {
  theme: ThemeConfig;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES.light,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');
  const toggleTheme = () => setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme: THEMES[mode], toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
