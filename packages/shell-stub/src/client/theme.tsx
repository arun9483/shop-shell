import { createRoot } from 'react-dom/client';
// The Shell's own switcher, so both pick and keep the theme the same way.
import { ThemeSwitcher } from '../../../../client/src/ThemeSwitcher.js';

export function mountThemeSwitcher(element: HTMLElement): void {
  createRoot(element).render(<ThemeSwitcher />);
}
