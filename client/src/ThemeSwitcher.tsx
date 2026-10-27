import { Select } from '@arun-dev/ui';
import { useState } from 'react';
import {
  readThemePreference,
  setThemePreference,
  THEME_PREFERENCES,
  type ThemePreference,
} from './theme';

const labels: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

/** Picks light, dark or system. The Shell owns it; the Shell stub renders the same one. */
export function ThemeSwitcher() {
  const [preference, setPreference] = useState(readThemePreference);

  return (
    <Select
      aria-label="Theme"
      value={preference}
      onChange={(event) => {
        const next = event.target.value as ThemePreference;
        setThemePreference(next);
        setPreference(next);
      }}
    >
      {THEME_PREFERENCES.map((value) => (
        <option key={value} value={value}>
          {labels[value]}
        </option>
      ))}
    </Select>
  );
}
