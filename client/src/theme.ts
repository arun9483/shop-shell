/** The theme a user picks: light, dark, or whatever the operating system prefers. */
export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

/**
 * Where the preference is kept. index.html reads the same key in an inline script, so the page paints
 * in the chosen theme before any module runs; keep the two in step.
 */
export const THEME_STORAGE_KEY = 'shop-theme';

function isPreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

/** The saved preference, or `system` when none is saved or storage is unavailable. */
export function readThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Applies a preference through the brand's theme modes: `data-theme` on `<html>` for light or dark,
 * none for system, so the brand's `prefers-color-scheme` rules decide.
 */
export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') delete root.dataset.theme;
  else root.dataset.theme = preference;
}

/** Applies a preference and keeps it for the next visit. */
export function setThemePreference(preference: ThemePreference): void {
  applyThemePreference(preference);
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage is blocked: the theme still applies for this page load.
  }
}
