import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyThemePreference,
  readThemePreference,
  setThemePreference,
  THEME_STORAGE_KEY,
} from './theme';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
});

describe('theme', () => {
  it('defaults to system', () => {
    expect(readThemePreference()).toBe('system');
  });

  it('ignores an unknown saved value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readThemePreference()).toBe('system');
  });

  it('sets data-theme for light and dark, and removes it for system', () => {
    applyThemePreference('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyThemePreference('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyThemePreference('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('keeps light and dark, and forgets system', () => {
    setThemePreference('dark');
    expect(readThemePreference()).toBe('dark');
    setThemePreference('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('still applies the theme when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    setThemePreference('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it.each(['index.html', '../packages/shell-stub/src/client/index.html'])(
    '%s applies the saved theme with the same key before the first paint',
    (path) => {
      // Vitest runs from the client folder.
      const html = readFileSync(resolve(path), 'utf8');
      expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
    },
  );
});
