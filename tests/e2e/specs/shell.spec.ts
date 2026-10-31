import { expect, test, type Page } from '@playwright/test';
import { externalOrigin, origin, ports } from '../mfes.js';
import { expectNoAxeViolations, origins, scripts, traceId, traceparent } from './helpers.js';

test.describe('lazy loading', () => {
  test('/ loads the home chunk but no other feature and no MFE code', async ({ page }) => {
    const loaded = scripts(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await expect(page.getByText('Welcome to the shop.')).toBeVisible();
    expect(loaded.some((path) => /\/Home-[\w-]+\.js$/.test(path))).toBe(true);
    expect(loaded.some((path) => /\/(Help|TestError)-/.test(path))).toBe(false);
    expect(loaded.some((path) => path.startsWith('/mfe/'))).toBe(false);
  });

  test('the help chunk loads on the first visit to /help', async ({ page }) => {
    const loaded = scripts(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await page.getByRole('link', { name: 'Help' }).click();
    await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();
    expect(loaded.filter((path) => /\/Help-/.test(path))).toHaveLength(1);
  });
});

test.describe('isolation', () => {
  test('a render error in a Shell feature shows its fallback; the frame keeps working', async ({
    page,
  }) => {
    await page.goto('/test-error?kind=render');
    await expect(page.getByText('This page is unavailable')).toBeVisible();
    await page.getByRole('link', { name: 'Help' }).click();
    await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();
  });
});

test.describe('origin and source maps', () => {
  test('the browser talks only to the router origin and New Relic; no map is served', async ({
    page,
  }) => {
    const seen = origins(page);
    await page.goto('/');
    await page.getByRole('link', { name: 'Help' }).click();
    await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();
    expect([...seen]).toEqual([origin]);

    const entry = await page.locator('script[type="module"]').getAttribute('src');
    expect(entry).toBeTruthy();
    const map = await page.request.get(`${entry}.map`);
    expect(map.status()).toBe(404);
  });
});

test.describe('API conventions', () => {
  test('responses carry the trace ID of the request', async ({ request }) => {
    const res = await request.get('/api/shell/greeting', { headers: { traceparent } });
    expect(res.status()).toBe(200);
    expect(res.headers().traceresponse).toMatch(new RegExp(`^00-${traceId}-`));
  });

  test('an unknown API route is a 404 problem with the trace ID', async ({ request }) => {
    const res = await request.get('/api/shell/no-such-route', { headers: { traceparent } });
    expect(res.status()).toBe(404);
    expect(res.headers()['content-type']).toMatch(/^application\/problem\+json/);
    expect(await res.json()).toMatchObject({ status: 404, traceId });
  });

  test('an FES error is a problem with the trace ID', async ({ request }) => {
    const res = await request.get('/api/shell/test-error', { headers: { traceparent } });
    expect(res.status()).toBe(500);
    expect(res.headers()['content-type']).toMatch(/^application\/problem\+json/);
    expect(await res.json()).toMatchObject({ traceId });
  });

  // The FES passes the trace on to its backend through the New Relic agent, which is off here, so
  // only the shape of the backend's problem is checked. The shared trace is checked in New Relic.
  test('a backend error comes back as its problem', async ({ request }) => {
    const res = await request.get('/api/shell/test-error?in=backend', { headers: { traceparent } });
    expect(res.status()).toBe(500);
    expect(res.headers()['content-type']).toMatch(/^application\/problem\+json/);
    expect(await res.json()).toMatchObject({ status: 500, traceId: expect.any(String) });
  });
});

test.describe('health and version', () => {
  for (const port of [ports.fes, ports.backend]) {
    test(`port ${port} answers health and version`, async ({ request }) => {
      test.skip(!!externalOrigin, 'servers are not reachable on their own ports');
      const base = `http://localhost:${port}`;
      expect((await request.get(`${base}/health/live`)).status()).toBe(200);
      expect((await request.get(`${base}/health/ready`)).status()).toBe(200);
      expect(await (await request.get(`${base}/version`)).json()).toHaveProperty('commit');
    });
  }

  test('the public origin answers health and version for the router and the Shell', async ({
    request,
  }) => {
    for (const path of ['/health/live', '/health/ready', '/version']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()['cache-control'], path).toBe('no-store');
    }
    expect(await (await request.get('/version')).json()).toMatchObject({ name: 'shop-router' });

    const units = await request.get('/health/units');
    expect(units.headers()['content-type']).toMatch(/^application\/health\+json/);
    expect(await units.json()).toMatchObject({
      serviceId: 'shop-router',
      checks: { 'shell:ready': [{ componentId: 'shell', status: 'pass' }] },
    });
    expect((await request.get('/health/units/shell')).status()).toBe(200);
    expect((await request.get('/health/units/no-such-unit')).status()).toBe(404);

    const versions = await request.get('/version/units');
    expect(await versions.json()).toMatchObject({
      units: { router: { name: 'shop-router' }, shell: { name: '@shop-shell/fes' } },
    });
    expect(await (await request.get('/version/units/shell')).json()).toMatchObject({
      name: '@shop-shell/fes',
    });
  });

  test('the client serves its version.json, uncached', async ({ request }) => {
    const res = await request.get('/version.json');
    expect(res.headers()['cache-control']).toBe('no-cache');
    expect(await res.json()).toMatchObject({ name: '@shop-shell/client' });
  });
});

test.describe('theme', () => {
  const background = (page: Page) =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  test('the switcher picks light, dark or system and keeps it', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const theme = page.getByRole('combobox', { name: 'Theme' });
    await expect(theme).toHaveValue('system');
    const light = await background(page);

    await theme.selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const dark = await background(page);
    expect(dark).not.toBe(light);

    // Kept across loads and applied before the first paint.
    await page.goto('/help');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(theme).toHaveValue('dark');
    expect(await background(page)).toBe(dark);

    await theme.selectOption('system');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await background(page)).toBe(dark);
  });

  for (const path of ['/', '/help']) {
    test(`${path} has no WCAG 2.2 AA violations in the dark theme`, async ({ page }) => {
      await page.goto(path);
      await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }
});

test.describe('accessibility', () => {
  for (const path of ['/', '/help', '/test-error']) {
    test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }
});
