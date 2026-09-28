'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  THEME_EVENT,
  THEME_STORAGE_KEY,
  Theme,
  ThemePreference,
  applyTheme,
  currentTheme,
  readPreference,
  resolveTheme,
  savePreference,
  systemPrefersDark,
  watchSystemTheme,
} from '@/services/theme';

function subscribe(onChange: () => void) {
  // Another tab changing the preference changes it here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    applyTheme(resolveTheme(readPreference(), systemPrefersDark()));
    onChange();
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  const unwatch = watchSystemTheme();
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
    unwatch();
  };
}

/**
 * The viewer's preference and the theme actually on screen.
 *
 * The server cannot know either, so it renders as Auto and dark; anything
 * whose markup depends on the theme only reaches the DOM after hydration, when
 * the real values take over.
 */
export function useTheme(): {
  preference: ThemePreference;
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
} {
  const preference = useSyncExternalStore(subscribe, readPreference, () => 'auto' as const);
  const theme = useSyncExternalStore(subscribe, currentTheme, () => 'dark' as const);
  const setPreference = useCallback((next: ThemePreference) => savePreference(next), []);
  return { preference, theme, setPreference };
}
