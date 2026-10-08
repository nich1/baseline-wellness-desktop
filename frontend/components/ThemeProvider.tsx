"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { applyTheme, defaultPreferences, parsePreferences, THEME_KEY, type Theme, type ThemePreferences } from '@/lib/themes';

const event = 'baseline-theme-change';
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(event, callback);
  return () => { window.removeEventListener('storage', callback); window.removeEventListener(event, callback); };
}
function snapshot() { try { return localStorage.getItem(THEME_KEY); } catch { return null; } }
const ThemeContext = createContext<{
  theme: Theme; preferences: ThemePreferences;
  preview: (theme: Theme | null) => void;
  save: (preferences: ThemePreferences) => void;
}>({
  theme: defaultPreferences.active, preferences: defaultPreferences,
  preview: () => {},
  save: () => {},
});
export function ThemeProvider({ children }: { children: ReactNode }) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const preferences = useMemo(() => parsePreferences(raw), [raw]);
  const [draft, preview] = useState<Theme | null>(null);
  const theme = draft ?? preferences.active;
  useLayoutEffect(() => { applyTheme(theme); }, [theme]);
  function save(next: ThemePreferences) {
    localStorage.setItem(THEME_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(event));
    preview(null);
  }
  return <ThemeContext.Provider value={{theme, preferences, preview, save}}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
