import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { THEME_STORAGE_KEY } from '@arun-dev/client';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

/** The page's inline script: the one in <head> without a src. */
function inlineScript(path: string): string {
  // Vitest runs from the client folder.
  const html = readFileSync(resolve(path), 'utf8');
  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) throw new Error(`${path} has no inline script`);
  return match[1];
}

describe('the no-flash theme script', () => {
  it.each(['index.html', '../packages/shell-stub/src/client/index.html'])(
    '%s applies the theme saved under the theme switcher’s key before the first paint',
    (path) => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      runInNewContext(inlineScript(path), { localStorage, document });
      expect(document.documentElement.dataset.theme).toBe('dark');
    },
  );
});
