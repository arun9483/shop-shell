// Timeouts in every part of every unit. Client timeouts run on the page clock, so these tests
// fast-forward it instead of waiting; they hold for any timeout values a unit is built with (up to
// 60 s). Each FES's backend timeout is set short with BACKEND_TIMEOUT_MS.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { externalOrigin, mfes } from '../mfes.js';
import { start, stopAll, traceId, traceparent, untilUp } from './helpers.js';

const longerThanAnyTimeout = 60_000;

// The clock is faked, so these finish in seconds; the limit is headroom for slow machines.
test.describe.configure({ timeout: 60_000 });

/**
 * Lets a matching request hang: it is never answered. Resolves once the page has made it, so the
 * clock is only advanced after the timeout timer has started.
 */
async function hang(page: Page, pattern: string): Promise<{ requested: Promise<void> }> {
  let made = () => {};
  const requested = new Promise<void>((resolve) => {
    made = resolve;
  });
  await page.route(pattern, () => {
    made();
  });
  return { requested };
}

/**
 * Advances the page clock a second at a time until `locator` shows. A timer that starts late (after
 * the entry or chunk arrives) still fires, and no timeout longer than a minute passes.
 */
async function advanceUntilVisible(page: Page, locator: Locator): Promise<void> {
  for (let elapsed = 0; elapsed < longerThanAnyTimeout; elapsed += 1000) {
    if (await locator.isVisible()) return;
    await page.clock.runFor(1000);
  }
  await expect(locator).toBeVisible();
}

async function expectShellStillWorks(page: Page) {
  await page.getByRole('link', { name: 'Help' }).click();
  await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();
}

const shell = {
  name: 'shell',
  dir: resolve(import.meta.dirname, '../../..'),
  available: true,
  api: ['/api/shell/greeting'],
  slowApi: {
    page: '/',
    api: '/api/shell/greeting',
    message: 'The greeting could not be loaded.',
  },
};
const units = [shell, ...mfes];

test.describe('Shell: slow lazy page', () => {
  test('a Shell page whose chunk never arrives shows the Shell page fallback', async ({ page }) => {
    await page.clock.install();
    const { requested } = await hang(page, '**/assets/Help-*.js');
    await page.goto('/help');
    await requested;
    await expect(page.getByText('This page is unavailable')).toBeHidden();
    await advanceUntilVisible(page, page.getByText('This page is unavailable'));
    await page.getByRole('link', { name: 'Home' }).click();
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  });
});

for (const mfe of mfes) {
  const { name } = mfe;
  const shellFallback = `The ${name} section is unavailable`;

  test.describe(`${name}: slow to load in the Shell`, () => {
    test('its entry never arrives: the Shell fallback shows', async ({ page }) => {
      await page.clock.install();
      const { requested } = await hang(page, `**/mfe/${name}/entry.js`);
      await page.goto(`/${name}`);
      await requested;
      await expect(page.getByText(shellFallback)).toBeHidden();
      await advanceUntilVisible(page, page.getByText(shellFallback));
      await expectShellStillWorks(page);
    });

    for (const lifecycle of ['bootstrap', 'mount'] as const) {
      test(`its ${lifecycle} never finishes: the Shell fallback shows`, async ({ page }) => {
        await page.clock.install();
        const never = 'new Promise(() => {})';
        const fine = 'Promise.resolve()';
        let served = () => {};
        const entryServed = new Promise<void>((resolve) => {
          served = resolve;
        });
        await page.route(`**/mfe/${name}/entry.js`, async (route) => {
          await route.fulfill({
            contentType: 'text/javascript',
            body: [
              `export const bootstrap = () => ${lifecycle === 'bootstrap' ? never : fine};`,
              `export const mount = () => ${lifecycle === 'mount' ? never : fine};`,
              `export const unmount = () => ${fine};`,
            ].join('\n'),
          });
          served();
        });
        await page.goto(`/${name}`);
        await entryServed;
        await expect(page.getByText(shellFallback)).toBeHidden();
        await advanceUntilVisible(page, page.getByText(shellFallback));
        await expectShellStillWorks(page);
      });
    }

    test('a feature chunk never arrives: its own fallback shows', async ({ page }) => {
      test.skip(!mfe.available, `shop-${name} is not checked out next to shop-shell and built`);
      await page.clock.install();
      const { requested } = await hang(page, `**/mfe/${name}/assets/TestError-*.js`);
      await page.goto(`/${name}/test-error`);
      await requested;
      const ownFallback = page.locator('#mfe-root [role="alert"]');
      await expect(ownFallback).toBeHidden();
      await advanceUntilVisible(page, ownFallback);
      await expect(page.getByText(shellFallback)).toBeHidden();
      await expectShellStillWorks(page);
    });
  });
}

for (const unit of units) {
  test.describe(`${unit.name}: slow API`, () => {
    test.skip(!unit.available, `shop-${unit.name} is not checked out next to shop-shell and built`);

    test('a client API call that never answers says it could not be loaded', async ({ page }) => {
      await page.clock.install();
      const { requested } = await hang(page, `**${unit.slowApi.api}`);
      await page.goto(unit.slowApi.page);
      await requested;
      await expect(page.getByText(unit.slowApi.message)).toBeHidden();
      await advanceUntilVisible(page, page.getByText(unit.slowApi.message));
    });
  });
}

test.describe('FES: slow backend', () => {
  test.skip(!!externalOrigin, 'starts its own FES');

  let slowBackend: Server;
  let slowBackendUrl: string;

  test.beforeAll(async () => {
    // A backend that accepts every request and never answers.
    slowBackend = createServer(() => {
      // Never answers.
    });
    slowBackend.listen(0);
    await new Promise((r) => slowBackend.once('listening', r));
    slowBackendUrl = `http://localhost:${(slowBackend.address() as AddressInfo).port}`;
  });

  test.afterAll(() => {
    stopAll();
    slowBackend.closeAllConnections();
    slowBackend.close();
  });

  for (const [index, unit] of units.entries()) {
    test(`${unit.name}: an API call is a 504 problem and readiness fails`, async ({ request }) => {
      test.skip(
        !unit.available,
        `shop-${unit.name} is not checked out next to shop-shell and built`,
      );
      const fes = `http://localhost:${3500 + index}`;
      start(`${unit.dir}/fes`, {
        PORT: String(3500 + index),
        BACKEND_URL: slowBackendUrl,
        BACKEND_TIMEOUT_MS: '500',
        CLIENT_DIST: `${unit.dir}/client/dist`,
      });
      await untilUp(`${fes}/health/live`);

      for (const path of unit.api) {
        const started = Date.now();
        const res = await request.get(`${fes}${path}`, { headers: { traceparent } });
        expect(Date.now() - started, path).toBeLessThan(3000);
        expect(res.status(), path).toBe(504);
        expect(res.headers()['content-type']).toMatch(/^application\/problem\+json/);
        expect(await res.json()).toMatchObject({ status: 504, title: 'Gateway Timeout', traceId });
      }

      const ready = await request.get(`${fes}/health/ready`);
      expect(ready.status()).toBe(503);
    });
  }
});
