// MVP-2 login for the Shell (phase 2), through a stack with login on: the Docker stack with
// shop-mfe-platform's compose.sso.yaml.
//
//   E2E_SSO=1 E2E_BASE_URL=https://shop.test TEST_USER_PASSWORD=… pnpm test:e2e
//
// Users log in on the identity provider's own page (Keycloak, https://shop.test:8443) as alice (every
// unit's roles) or bob (no Catalog role).
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { origin } from '../mfes.js';
import { expectNoAxeViolations } from './helpers.js';

const password = process.env.TEST_USER_PASSWORD ?? '';
const idpOrigin = process.env.E2E_IDP_ORIGIN ?? 'https://shop.test:8443';
const names = { alice: 'Alice Test', bob: 'Bob Test' } as const;
type User = keyof typeof names;

test.beforeAll(() => {
  expect(password, 'TEST_USER_PASSWORD from shop-mfe-platform/docker/.env').not.toBe('');
});

const onLoginPage = (page: Page) => expect(page).toHaveURL(new RegExp(`^${idpOrigin}/`));

async function fillLogin(page: Page, user: User): Promise<void> {
  await page.locator('#username').fill(user);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
}

/** Opens `path`, logs in on the IdP's page, and waits to be back on `path`. */
async function login(page: Page, user: User, path = '/'): Promise<void> {
  await page.goto(path);
  await onLoginPage(page);
  await fillLogin(page, user);
  await expect(page).toHaveURL(`${origin}${path}`);
  await expect(page.getByText(names[user])).toBeVisible();
}

async function cookie(context: BrowserContext, name: string) {
  return (
    (await context.cookies(origin)).find((c) => c.name === name) ??
    (await context.cookies(`${origin}/auth/logout`)).find((c) => c.name === name)
  );
}

test.describe('without logging in', () => {
  test('pages go to login and come back to the same address; APIs answer 401', async ({
    page,
    request,
  }) => {
    await page.goto('/help?x=1');
    await onLoginPage(page);
    const returnTo = new URL(page.url()).searchParams.get('redirect_uri');
    expect(returnTo).toBe(`${origin}/auth/callback`);

    const api = await request.get('/api/shell/greeting');
    expect(api.status()).toBe(401);
    expect(api.headers()['content-type']).toContain('application/problem+json');
    expect(api.headers()['cache-control']).toBe('no-store');
  });

  test('hashed files and version.json stay public', async ({ page, request }) => {
    await login(page, 'alice');
    const script = await page.locator('script[type="module"][src]').first().getAttribute('src');
    expect(script).toMatch(/^\/assets\//);
    expect((await request.get(script ?? '')).status()).toBe(200);
    expect((await request.get('/version.json')).status()).toBe(200);
  });
});

test.describe('logged in', () => {
  test('lands on the page asked for, with the three cookies, none readable by page code', async ({
    page,
    context,
  }) => {
    await login(page, 'alice', '/help');
    await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();

    const at = await cookie(context, 'shop_at');
    const rt = (await context.cookies(`${origin}/auth/refresh`)).find((c) => c.name === 'shop_rt');
    const id = await cookie(context, 'shop_id');
    expect([at?.path, rt?.path, id?.path]).toEqual(['/', '/auth', '/auth/logout']);
    for (const c of [at, rt, id]) {
      expect(c).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' });
    }
    expect(await page.evaluate(() => document.cookie)).not.toMatch(/shop_/);
  });

  test('pages and API calls carry only shop_at', async ({ page }) => {
    const sent: string[] = [];
    // The page itself and API calls; files served from the browser's cache send no headers at all.
    page.on('request', async (req) => {
      const kind = req.resourceType();
      if (new URL(req.url()).origin === origin && (kind === 'document' || kind === 'fetch')) {
        sent.push((await req.allHeaders()).cookie ?? '');
      }
    });
    await login(page, 'alice');
    sent.length = 0;
    await page.reload();
    await expect(page.getByText('Welcome to the shop.')).toBeVisible();
    expect(sent.length).toBeGreaterThan(2);
    for (const header of sent) {
      expect(header).toContain('shop_at=');
      expect(header).not.toMatch(/shop_rt=|shop_id=/);
    }
  });

  test('/api/shell/me gives the user and the Shell roles, never a token or sid', async ({
    page,
  }) => {
    await login(page, 'alice');
    const res = await page.request.get('/api/shell/me');
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toBe('no-store');
    expect(res.headers().vary).toMatch(/Cookie/);
    const me = (await res.json()) as Record<string, unknown>;
    expect(me).toMatchObject({
      preferred_username: 'alice',
      name: 'Alice Test',
      roles: ['shell-user'],
    });
    expect(typeof me.sub).toBe('string');
    expect(Object.keys(me)).not.toEqual(expect.arrayContaining(['sid']));
    expect(JSON.stringify(me)).not.toMatch(/eyJ/);
  });

  test('the user display has no axe violations in either theme', async ({ page }) => {
    await login(page, 'alice');
    for (const theme of ['light', 'dark']) {
      await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
      await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
      await expectNoAxeViolations(page);
    }
  });
});

test.describe('refresh', () => {
  test('an expired access token is refreshed once and the call retried', async ({
    page,
    context,
  }) => {
    await login(page, 'alice');
    const refreshes: number[] = [];
    page.on('response', (res) => {
      if (res.url() === `${origin}/auth/refresh`) refreshes.push(res.status());
    });
    // As if shop_at had expired: the next API call is a 401.
    await context.clearCookies({ name: 'shop_at' });
    await page.getByRole('link', { name: 'Help' }).click();
    await page.getByRole('link', { name: 'Home' }).click();
    await expect(page.getByText('Welcome to the shop.')).toBeVisible();
    expect(refreshes).toEqual([204]);
    expect((await cookie(context, 'shop_at'))?.path).toBe('/');
  });
});

test.describe('logout', () => {
  test('no confirmation page, cookies cleared, and access ends', async ({ page, context }) => {
    test.setTimeout(90_000);
    await login(page, 'alice');
    const oldAccess = (await cookie(context, 'shop_at'))?.value ?? '';
    const oldRefresh =
      (await context.cookies(`${origin}/auth/refresh`)).find((c) => c.name === 'shop_rt')?.value ??
      '';

    await page.getByRole('button', { name: 'Log out' }).click();
    // Back to the shop, which is protected, so on to the IdP's login form: never its "log out?" page.
    await onLoginPage(page);
    await expect(page.locator('#username')).toBeVisible();
    expect((await context.cookies(origin)).filter((c) => c.name.startsWith('shop_'))).toEqual([]);

    const refresh = await page.request.post('/auth/refresh', {
      headers: { origin, cookie: `shop_rt=${oldRefresh}` },
    });
    expect(refresh.status()).toBe(401);
    // The old access token stops working within 30 s: the FES gate and the backend each reuse an
    // answer for 15 s.
    await expect
      .poll(
        async () =>
          (
            await page.request.get('/api/shell/greeting', {
              headers: { cookie: `shop_at=${oldAccess}` },
            })
          ).status(),
        { timeout: 40_000, intervals: [2_000] },
      )
      .toBe(401);
  });
});

test.describe('several tabs', () => {
  test('logging out in one tab sends the other to login at once', async ({ context }) => {
    const first = await context.newPage();
    await login(first, 'alice');
    const second = await context.newPage();
    await second.goto('/help');
    await expect(second.getByText(names.alice)).toBeVisible();

    await first.getByRole('button', { name: 'Log out' }).click();
    await onLoginPage(second);
  });

  test('logins started in two tabs both succeed', async ({ context }) => {
    const [first, second] = [await context.newPage(), await context.newPage()];
    await first.goto('/');
    await second.goto('/help');
    await onLoginPage(first);
    await onLoginPage(second);
    await fillLogin(first, 'alice');
    await expect(first.getByText(names.alice)).toBeVisible();
    await fillLogin(second, 'alice');
    await expect(second).toHaveURL(`${origin}/help`);
    await expect(second.getByText(names.alice)).toBeVisible();
  });

  test('another user logging in in one tab makes the other reload as that user', async ({
    context,
  }) => {
    const [first, second] = [await context.newPage(), await context.newPage()];
    await login(first, 'alice');
    // Log out at the IdP directly, so the Shell sends no "logged-out" message, then log in as bob.
    await second.goto(`${idpOrigin}/realms/shop/protocol/openid-connect/logout`);
    await second.locator('#kc-logout').click();
    await second.goto('/auth/login');
    await fillLogin(second, 'bob');
    await expect(second.getByText(names.bob)).toBeVisible();
    await expect(first.getByText(names.bob)).toBeVisible();
    await expect(first.getByText(names.alice)).toHaveCount(0);
  });
});

// Phase 3: Catalog and Cart check logins the Shell made.
test.describe('Catalog and Cart', () => {
  test('without login, MFE entries and APIs answer 401; hashed files stay public', async ({
    page,
    request,
  }) => {
    for (const path of [
      '/mfe/catalog/entry.js',
      '/api/catalog/products',
      '/mfe/cart/entry.js',
      '/api/cart',
    ]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
      expect(res.headers()['content-type'], path).toContain('application/problem+json');
    }
    await login(page, 'alice');
    const entry = await (await page.request.get('/mfe/catalog/entry.js')).text();
    const hashed = /assets\/entry-[\w-]+\.js/.exec(entry)?.[0] ?? '';
    expect(hashed).not.toBe('');
    expect((await request.get(`/mfe/catalog/${hashed}`)).status()).toBe(200);
  });

  test('a logged-in user uses both; their requests carry only shop_at', async ({ page }) => {
    const sent: { url: string; cookie: string }[] = [];
    page.on('request', async (req) => {
      const { origin: from, pathname } = new URL(req.url());
      if (from === origin && /^\/(mfe|api)\/(catalog|cart)\//.test(pathname)) {
        sent.push({ url: pathname, cookie: (await req.allHeaders()).cookie ?? '' });
      }
    });
    await login(page, 'alice', '/catalog');
    await expect(page.getByRole('link', { name: 'Stoneware mug' })).toBeVisible();
    await page.getByRole('link', { name: 'Cart', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cart' })).toBeVisible();
    await expect(page.getByText('× 2')).toBeVisible();
    const fetched = sent.filter((s) => s.cookie !== '');
    expect(fetched.length).toBeGreaterThan(2);
    for (const { url, cookie } of fetched) {
      expect(cookie, url).toContain('shop_at=');
      expect(cookie, url).not.toMatch(/shop_rt=|shop_id=/);
    }
  });

  test('without a Catalog role: no access to Catalog, the rest of the shop works', async ({
    page,
  }) => {
    await login(page, 'bob');
    expect((await page.request.get('/api/catalog/products')).status()).toBe(403);
    expect((await page.request.get('/mfe/catalog/entry.js')).status()).toBe(403);
    await page.getByRole('link', { name: 'Catalog' }).click();
    await expect(page.getByText('You do not have access to Catalog')).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await page.getByRole('combobox', { name: 'Theme' }).selectOption(theme);
      await expectNoAxeViolations(page);
    }
    await page.getByRole('link', { name: 'Cart', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cart' })).toBeVisible();
    await expect(page.getByText(names.bob)).toBeVisible();
  });

  test("/api/catalog/me and /api/cart/me give only that unit's roles", async ({ page }) => {
    await login(page, 'alice');
    const catalog = await page.request.get('/api/catalog/me');
    const cart = await page.request.get('/api/cart/me');
    expect(catalog.headers()['cache-control']).toBe('no-store');
    expect(await catalog.json()).toMatchObject({
      preferred_username: 'alice',
      roles: ['catalog-editor', 'catalog-viewer'],
    });
    expect(await cart.json()).toMatchObject({ preferred_username: 'alice', roles: ['cart-user'] });
    expect(JSON.stringify(await catalog.json())).not.toMatch(/sid|eyJ/);
  });

  test('an expired login is refreshed for an MFE API call and for an MFE entry', async ({
    page,
    context,
  }) => {
    const refreshes: number[] = [];
    page.on('response', (res) => {
      if (res.url() === `${origin}/auth/refresh`) refreshes.push(res.status());
    });
    await login(page, 'alice', '/catalog');
    await expect(page.getByRole('link', { name: 'Stoneware mug' })).toBeVisible();

    await context.clearCookies({ name: 'shop_at' });
    await page.getByRole('link', { name: 'Stoneware mug' }).click();
    await expect(page.getByText('Holds 350 ml and keeps tea warm.')).toBeVisible();
    expect(refreshes).toEqual([204]);

    // Cart's entry has not been loaded yet: its import is refused, refreshed and loaded again.
    await context.clearCookies({ name: 'shop_at' });
    await page.getByRole('link', { name: 'Cart', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cart' })).toBeVisible();
    expect(refreshes).toEqual([204, 204]);
  });

  test('after logout, Catalog and Cart refuse the old login within 30 s', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await login(page, 'alice', '/catalog');
    await expect(page.getByRole('link', { name: 'Stoneware mug' })).toBeVisible();
    const oldAccess = (await cookie(context, 'shop_at'))?.value ?? '';
    await page.getByRole('button', { name: 'Log out' }).click();
    await onLoginPage(page);
    for (const path of ['/api/catalog/products', '/api/cart']) {
      await expect
        .poll(
          async () =>
            (
              await page.request.get(path, { headers: { cookie: `shop_at=${oldAccess}` } })
            ).status(),
          { timeout: 40_000, intervals: [2_000] },
        )
        .toBe(401);
    }
  });
});
