// Standalone mode: each MFE runs on the Shell stub (@arun-shop/shell-stub, built from
// packages/shell-stub), with its own FES and backend and no Shell app.
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { mfes, ports } from '../mfes.js';
import { expectNoAxeViolations, origins, scripts, start, stopAll, untilUp } from './helpers.js';

const stubDir = resolve(import.meta.dirname, '../../../packages/shell-stub');

// The tests here start servers on fixed ports, so they run in order in one worker: with workers in
// parallel, a second worker's stub could not take the port, answer from the first worker's stub, and
// lose it when the first worker finished.
test.describe.configure({ mode: 'default' });

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

    test('switches the theme as the Shell does, and keeps it', async ({ page }) => {
      await page.goto(`${stub}/${name}`);
      await expect(page.locator('#mfe-root h1')).toBeVisible();
      const theme = page.getByRole('combobox', { name: 'Theme' });
      await expect(theme).toHaveValue('system');
      await theme.selectOption('dark');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(theme).toHaveValue('dark');
      await expect(page.locator('#mfe-root h1')).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test(`/${name} has no WCAG 2.2 AA violations`, async ({ page }) => {
      await page.goto(`${stub}/${name}`);
      await expect(page.locator('#mfe-root h1')).toBeVisible();
      await expectNoAxeViolations(page);
    });
  });
}

for (const [index, mfe] of mfes.entries()) {
  const { name } = mfe;
  const stub = `http://localhost:${3700 + index}`;

  test.describe(`${name} standalone, development mode (HMR)`, () => {
    test.skip(!mfe.available || !mfe.devMode, `shop-${name} has no standalone development mode`);

    test.beforeAll(async () => {
      // One process: the stub runs the MFE's own Vite, from its client project.
      start(stubDir, {}, [
        'bin/shell-stub.js',
        '--name',
        name,
        '--mfe-url',
        `http://localhost:${mfe.fesPort}`,
        '--port',
        String(3700 + index),
        '--dev',
        '--dev-root',
        `${mfe.dir}/client`,
      ]);
      await untilUp(`${stub}/${name}`);
    });

    test('runs its source through its own Vite with HMR on the stub origin', async ({ page }) => {
      const loaded = scripts(page);
      const sockets: string[] = [];
      page.on('websocket', (ws) => sockets.push(ws.url()));
      await page.goto(`${stub}/${name}`);
      await expect(page.locator('#mfe-root h1')).toBeVisible();
      expect(loaded).toContain(`/mfe/${name}/@vite/client`);
      expect(loaded).toContain(`/mfe/${name}/src/entry.tsx`);
      expect(loaded).not.toContain(`/mfe/${name}/entry.js`);
      const ws = `${stub.replace('http', 'ws')}/mfe/${name}/`;
      await expect.poll(() => sockets.some((url) => url.startsWith(ws))).toBe(true);
    });
  });
}

// MVP-2: standalone without an IdP, with the development-only login bypass.
test.describe('catalog standalone, login bypass (development only)', () => {
  const catalog = mfes.find((m) => m.name === 'catalog');
  const fesPort = 3612;
  const backendPort = 4612;
  const stub = 'http://localhost:3611';
  const bypass = {
    AUTH_DEV_BYPASS: 'true',
    AUTH_DEV_USER_SUB: 'dev-alice',
    AUTH_DEV_USER_ROLES: 'catalog-viewer',
  };

  test.skip(!catalog?.available, 'shop-catalog is not checked out next to shop-shell and built');

  test.beforeAll(async () => {
    if (!catalog) return;
    start(`${catalog.dir}/mock-backend`, { ...bypass, PORT: String(backendPort) });
    start(`${catalog.dir}/fes`, {
      ...bypass,
      PORT: String(fesPort),
      BACKEND_URL: `http://localhost:${backendPort}`,
      CLIENT_DIST: '../client/dist',
    });
    await untilUp(`http://localhost:${fesPort}/health/ready`);
    start(stubDir, {}, [
      'bin/shell-stub.js',
      '--name',
      'catalog',
      '--mfe-url',
      `http://localhost:${fesPort}`,
      '--port',
      '3611',
    ]);
    await untilUp(`${stub}/catalog`);
  });

  test('works as the configured user with no IdP, and says so on every response', async ({
    page,
  }) => {
    const marked: (string | undefined)[] = [];
    page.on('response', (res) => {
      if (/\/(mfe|api)\/catalog\//.test(new URL(res.url()).pathname)) {
        marked.push(res.headers()['x-auth-dev-bypass']);
      }
    });
    await page.goto(`${stub}/catalog`);
    await expect(page.getByRole('link', { name: 'Stoneware mug' })).toBeVisible();
    expect(marked.length).toBeGreaterThan(1);
    expect(marked.every((value) => value === 'true')).toBe(true);
    const me = await page.request.get(`${stub}/api/catalog/me`);
    expect(await me.json()).toMatchObject({ sub: 'dev-alice', roles: ['catalog-viewer'] });
  });

  test('refuses to start in production or on Cloud Run', async () => {
    if (!catalog) return;
    for (const extra of [{ NODE_ENV: 'production' }, { K_SERVICE: 'catalog-fes' }]) {
      const child = start(`${catalog.dir}/fes`, { ...bypass, ...extra, PORT: '3613' });
      const code = await new Promise<number | null>((resolve) => child.once('exit', resolve));
      expect(code, JSON.stringify(extra)).not.toBe(0);
    }
  });
});
