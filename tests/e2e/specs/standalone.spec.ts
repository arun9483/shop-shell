// Standalone mode: each MFE runs on the Shell stub (@arun-shop/shell-stub, built from
// packages/shell-stub), with its own FES and backend and no Shell app.
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { mfes, ports } from '../mfes.js';
import { expectNoAxeViolations, origins, scripts, start, stopAll, untilUp } from './helpers.js';

const stubDir = resolve(import.meta.dirname, '../../../packages/shell-stub');

test.afterAll(stopAll);

/** The brand values a page resolves: font, accent colour and link colour. */
function brand(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('a');
    probe.className = 'link';
    document.body.append(probe);
    const values = {
      font: getComputedStyle(document.body).fontFamily.split(',')[0],
      accent: getComputedStyle(document.documentElement).getPropertyValue('--color-text-accent'),
      link: getComputedStyle(probe).color,
      interLoaded: [...document.fonts].some((f) => f.family === 'Inter' && f.status === 'loaded'),
    };
    probe.remove();
    return values;
  });
}

for (const [index, mfe] of mfes.entries()) {
  const { name } = mfe;
  const stub = `http://localhost:${3600 + index}`;

  test.describe(`${name} standalone`, () => {
    test.skip(!mfe.available, `shop-${name} is not checked out next to shop-shell and built`);

    test.beforeAll(async () => {
      start(stubDir, {}, [
        'bin/shell-stub.js',
        '--name',
        name,
        '--mfe-url',
        `http://localhost:${mfe.fesPort}`,
        '--port',
        String(3600 + index),
      ]);
      await untilUp(`${stub}/${name}`);
    });

    test('runs on the stub with only its own servers, lazy as in the Shell', async ({ page }) => {
      const seen = origins(page);
      const loaded = scripts(page);
      await page.goto(stub);
      await expect(page).toHaveURL(`${stub}/${name}`);
      await expect(page.locator('#mfe-root h1')).toBeVisible();
      await expect(page.locator('#stub-title')).toHaveText(
        new RegExp(`${name} \\(standalone\\)`, 'i'),
      );
      expect(loaded).toContain(`/mfe/${name}/entry.js`);
      expect([...seen]).toEqual([stub]);
    });

    test('looks as it does in the Shell: same font and brand', async ({ page }) => {
      await page.goto(`http://localhost:${ports.router}/${name}`);
      await expect(page.locator('#mfe-root h1')).toBeVisible();
      const inShell = await brand(page);
      await page.goto(`${stub}/${name}`);
      await expect(page.locator('#mfe-root h1')).toBeVisible();
      await expect.poll(() => brand(page)).toEqual(inShell);
      expect(inShell).toMatchObject({ font: 'Inter', interLoaded: true });
    });

    test('a render error shows its own fallback', async ({ page }) => {
      await page.goto(`${stub}/${name}/test-error?kind=render`);
      await expect(page.locator('#mfe-root [role="alert"]')).toBeVisible();
    });

    test('an entry that cannot load shows the stub fallback', async ({ page }) => {
      await page.route(`**/mfe/${name}/entry.js`, (route) => route.abort());
      await page.goto(`${stub}/${name}`);
      await expect(page.getByText(`The ${name} section is unavailable`)).toBeVisible();
    });

    if (name === 'catalog') {
      test('in-page links work without the Shell', async ({ page }) => {
        const loaded = scripts(page);
        await page.goto(`${stub}/catalog`);
        await page.getByRole('link', { name: 'Stoneware mug' }).click();
        await expect(page.getByRole('heading', { name: 'Stoneware mug' })).toBeVisible();
        await expect(page).toHaveURL(`${stub}/catalog/mug`);
        expect(loaded.filter((path) => /\/ProductDetail-/.test(path))).toHaveLength(1);
      });
    }

    test(`/${name} has no WCAG 2.2 AA violations`, async ({ page }) => {
      await page.goto(`${stub}/${name}`);
      await expect(page.locator('#mfe-root h1')).toBeVisible();
      await expectNoAxeViolations(page);
    });
  });
}
