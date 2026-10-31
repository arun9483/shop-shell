// Checks every MFE in the Shell's static list the same way, so a new MFE is covered as
// soon as its repository is checked out and built. MFE-specific pages are in <name>.spec.ts.
import { expect, test, type Page } from '@playwright/test';
import { externalOrigin, mfes, origin } from '../mfes.js';
import { expectNoAxeViolations, origins, scripts, traceId, traceparent } from './helpers.js';

for (const mfe of mfes) {
  const { name } = mfe;

  test.describe(`${name}: isolation when it fails`, () => {
    // Each failure is made in the browser, so these tests do not depend on how the MFE is running.
    const shellFallback = `The ${name} section is unavailable`;

    async function expectShellStillWorks(page: Page) {
      await page.getByRole('link', { name: 'Help' }).click();
      await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();
    }

    test('its entry cannot be downloaded: the Shell fallback shows', async ({ page }) => {
      await page.route(`**/mfe/${name}/entry.js`, (route) => route.abort());
      await page.goto(`/${name}`);
      await expect(page.getByText(shellFallback)).toBeVisible();
      await expectShellStillWorks(page);
    });

    test('its entry answers 500: the Shell fallback shows', async ({ page }) => {
      await page.route(`**/mfe/${name}/entry.js`, (route) =>
        route.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error' }),
      );
      await page.goto(`/${name}`);
      await expect(page.getByText(shellFallback)).toBeVisible();
      await expectShellStillWorks(page);
    });

    test('its mount throws: the Shell fallback shows', async ({ page }) => {
      await page.route(`**/mfe/${name}/entry.js`, (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body: [
            'export const bootstrap = () => Promise.resolve();',
            `export const mount = () => Promise.reject(new Error('${name} mount failed'));`,
            'export const unmount = () => Promise.resolve();',
          ].join('\n'),
        }),
      );
      await page.goto(`/${name}`);
      await expect(page.getByText(shellFallback)).toBeVisible();
      await expectShellStillWorks(page);
    });

    test('a feature chunk cannot be downloaded: its own fallback shows', async ({ page }) => {
      test.skip(!mfe.available, `shop-${name} is not checked out next to shop-shell and built`);
      await page.route(`**/mfe/${name}/assets/TestError-*.js`, (route) => route.abort());
      await page.goto(`/${name}/test-error`);
      // The entry mounted, so the MFE's own error boundary catches the failed lazy chunk.
      await expect(page.locator('#mfe-root [role="alert"]')).toBeVisible();
      await expect(page.getByText(shellFallback)).toBeHidden();
      await expectShellStillWorks(page);
    });
  });

  test.describe(name, () => {
    test.skip(!mfe.available, `shop-${name} is not checked out next to shop-shell and built`);

    test('follows the Shell theme, with no WCAG 2.2 AA violations in dark', async ({ page }) => {
      await page.goto(`/${name}`);
      await expect(page.locator('#mfe-root h1')).toBeVisible();
      const heading = () =>
        page.locator('#mfe-root h1').evaluate((element) => getComputedStyle(element).color);
      await page.getByRole('combobox', { name: 'Theme' }).selectOption('light');
      const light = await heading();
      await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
      expect(await heading()).not.toBe(light);
      await expectNoAxeViolations(page);
    });

    test('loads only on its route, once', async ({ page }) => {
      const loaded = scripts(page);
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      expect(loaded.filter((path) => path.startsWith(`/mfe/${name}/`))).toEqual([]);

      await page.getByRole('link', { name: new RegExp(`^${name}$`, 'i') }).click();
      await expect(page.locator('#mfe-root h1')).toBeVisible();
      const first = loaded.filter((path) => path.startsWith(`/mfe/${name}/`));
      expect(first).toContain(`/mfe/${name}/entry.js`);

      await page.getByRole('link', { name: 'Home' }).click();
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      await page.getByRole('link', { name: new RegExp(`^${name}$`, 'i') }).click();
      await expect(page.locator('#mfe-root h1')).toBeVisible();
      expect(loaded.filter((path) => path.startsWith(`/mfe/${name}/`))).toEqual(first);
    });

    test('its entry is lean: a re-export of a hashed entry without feature code', async ({
      page,
      request,
    }) => {
      const entry = await request.get(`/mfe/${name}/entry.js`);
      expect(entry.headers()['cache-control']).toBe('no-cache');
      const target = /^export \* from '\.\/(assets\/entry-[\w-]+\.js)';\n$/.exec(
        await entry.text(),
      );
      expect(target).not.toBeNull();

      const hashed = await request.get(`/mfe/${name}/${target?.[1] ?? ''}`);
      expect(hashed.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
      const staticImports = [...(await hashed.text()).matchAll(/from"\.\/([\w.]+)-[\w-]+\.js"/g)];
      // The test-error page, like every feature, is a lazy chunk the entry does not import.
      expect(staticImports.map((m) => m[1])).not.toContain('TestError');

      const loaded = scripts(page);
      await page.goto(`/${name}/test-error`);
      await expect(page.locator('#mfe-root h1')).toBeVisible();
      expect(loaded.some((path) => path.startsWith(`/mfe/${name}/assets/TestError-`))).toBe(true);
    });

    test('a render error shows its fallback; the Shell keeps working', async ({ page }) => {
      await page.goto(`/${name}/test-error?kind=render`);
      await expect(page.locator('#mfe-root [role="alert"]')).toBeVisible();
      await page.getByRole('link', { name: 'Help' }).click();
      await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();
    });

    test('the browser talks only to the router origin; its API calls stay in /api/<name>', async ({
      page,
    }) => {
      const seen = origins(page);
      const api: string[] = [];
      page.on('request', (req) => {
        const { pathname } = new URL(req.url());
        if (pathname.startsWith('/api/')) api.push(pathname);
      });
      await page.goto(`/${name}/test-error?kind=fes`);
      await page.getByRole('button').click();
      await expect(page.locator('output')).toContainText('HTTP 500');
      expect([...seen]).toEqual([origin]);
      expect(api.every((path) => path.startsWith(`/api/${name}/`))).toBe(true);
    });

    test('serves no source maps', async ({ request }) => {
      const entry = await (await request.get(`/mfe/${name}/entry.js`)).text();
      const hashed = /assets\/entry-[\w-]+\.js/.exec(entry)?.[0] ?? '';
      expect((await request.get(`/mfe/${name}/${hashed}.map`)).status()).toBe(404);
    });

    test('its FES and backend errors are problems with the trace ID', async ({ request }) => {
      for (const path of [`/api/${name}/test-error`, `/api/${name}/test-error?in=backend`]) {
        const res = await request.get(path, { headers: { traceparent } });
        expect(res.status()).toBe(500);
        expect(res.headers()['content-type']).toMatch(/^application\/problem\+json/);
        expect(res.headers().traceresponse).toMatch(/^00-[0-9a-f]{32}-/);
      }
      const fes = await request.get(`/api/${name}/test-error`, { headers: { traceparent } });
      expect(fes.headers().traceresponse).toMatch(new RegExp(`^00-${traceId}-`));
      expect(await fes.json()).toMatchObject({ traceId });
    });

    test('every API response carries the trace ID of the request', async ({ request }) => {
      for (const path of mfe.api) {
        const res = await request.get(path, { headers: { traceparent } });
        expect(res.status(), path).toBe(200);
        expect(res.headers().traceresponse, path).toMatch(new RegExp(`^00-${traceId}-`));
      }
      const missing = await request.get(`/api/${name}/no-such-route`, { headers: { traceparent } });
      expect(missing.status()).toBe(404);
      expect(missing.headers()['content-type']).toMatch(/^application\/problem\+json/);
      expect(await missing.json()).toMatchObject({ status: 404, traceId });
    });

    test('its FES and backend answer health and version; its client serves version.json', async ({
      request,
    }) => {
      for (const port of externalOrigin ? [] : [mfe.fesPort, mfe.backendPort]) {
        const base = `http://localhost:${port}`;
        expect((await request.get(`${base}/health/live`)).status()).toBe(200);
        expect((await request.get(`${base}/health/ready`)).status()).toBe(200);
        expect(await (await request.get(`${base}/version`)).json()).toHaveProperty('commit');
      }
      const version = await request.get(`/mfe/${name}/version.json`);
      expect(version.headers()['cache-control']).toBe('no-cache');
      expect(await version.json()).toMatchObject({ name: `@shop-${name}/client` });
    });

    for (const path of [`/${name}`, `/${name}/test-error`]) {
      test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator('#mfe-root h1')).toBeVisible();
        await expectNoAxeViolations(page);
      });
    }
  });
}
