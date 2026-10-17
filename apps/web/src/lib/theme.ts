import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'wc-theme';
const THEME_COLORS: Record<Theme, string> = { light: '#ffffff', dark: '#16181d' };
const listeners = new Set<() => void>();

const current = (): Theme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

/** Switch between the light (default) and dark theme and remember the choice in this browser. */
export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable (private mode etc.): the choice just won't persist
  }
  for (const listener of listeners) listener();
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => 'light',
  );
}

/** Resolved value of a theme token such as `--color-brand`, for places that need a literal colour. */
export function useThemeColor(token: string): string {
  useTheme();
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}
