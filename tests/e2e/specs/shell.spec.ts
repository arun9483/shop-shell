import { expect, test } from '@playwright/test';
import { ports } from '../mfes.js';
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
    expect([...seen]).toEqual([`http://localhost:${ports.router}`]);

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
      const base = `http://localhost:${port}`;
      expect((await request.get(`${base}/health/live`)).status()).toBe(200);
      expect((await request.get(`${base}/health/ready`)).status()).toBe(200);
      expect(await (await request.get(`${base}/version`)).json()).toHaveProperty('commit');
    });
  }

  test('the router does not expose health', async ({ request }) => {
    expect((await request.get('/health/live')).status()).toBe(404);
  });

  test('the client serves its version.json, uncached', async ({ request }) => {
    const res = await request.get('/version.json');
    expect(res.headers()['cache-control']).toBe('no-cache');
    expect(await res.json()).toMatchObject({ name: '@shop-shell/client' });
  });
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
