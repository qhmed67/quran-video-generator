export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

export function readTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  window.localStorage.setItem(STORAGE_KEY, theme);
}

/** Toggle helper shared by the studio and the landing page so the two cannot drift. */
export function flipTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

export const THEME_COLOR: Record<Theme, string> = {
  light: '#f5f2e9',
  dark: '#101413',
};
