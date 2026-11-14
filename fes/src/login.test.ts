import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  cookieSealer,
  IdpUnavailableError,
  problemHandler,
  type Idp,
  type IdpAdapter,
} from '@shop-shell/server-common';
import express from 'express';
import * as oidc from 'openid-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { safeReturnTo, loginRoutes } from './login.js';

const ORIGIN = 'https://shop.test';

describe('safeReturnTo', () => {
  it.each([
    ['/catalog/42?x=1', '/catalog/42?x=1'],
    ['/', '/'],
    ['https://evil.test/', '/'],
    ['//evil.test/', '/'],
    ['/\\evil.test', '/'],
    ['/a\nb', '/'],
    ['/auth/login', '/'],
    [undefined, '/'],
    [['/a', '/b'], '/'],
  ])('%j → %s', (value, expected) => {
    expect(safeReturnTo(value)).toBe(expected);
  });
});

function app(): express.Express {
  // These tests stop before any IdP call.
  const idp = () => Promise.reject(new Error('no IdP in this test'));
  const adapter = { isAccessToken: () => true } as unknown as IdpAdapter;
  const routes = loginRoutes({
    idp: idp,
    adapter,
    publicOrigin: ORIGIN,
    sealer: cookieSealer('c'.repeat(64)),
  });
  return express().use(routes).use(problemHandler);
}

describe('login routes', () => {
  it.each(['/auth/refresh', '/auth/logout'])('%s refuses another origin with 403', async (path) => {
    const res = await request(app()).post(path).set('origin', 'https://evil.test');
    expect(res.status).toBe(403);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('refresh without a refresh token is 401 and clears all three cookies, each with its own path', async () => {
    const res = await request(app()).post('/auth/refresh').set('origin', ORIGIN);
    expect(res.status).toBe(401);
    const cleared = (res.headers['set-cookie'] as unknown as string[]).map((c) =>
      c.split(';').slice(0, 2).join(';'),
    );
    expect(cleared).toEqual([
      'shop_at=; Path=/',
      'shop_rt=; Path=/auth',
      'shop_id=; Path=/auth/logout',
    ]);
  });
});

describe('addresses under /auth that are not pages (MVP-2 verification, F1)', () => {
  it.each(['/auth/logout', '/auth/refresh'])('GET %s is 405, POST only', async (path) => {
    const res = await request(app()).get(path);
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('POST');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('explains how to log out', async () => {
    expect((await request(app()).get('/auth/logout')).text).toContain('use the Log out button');
  });

  it.each(['/auth', '/auth/nope'])('%s is a 404, not the app', async (path) => {
    const res = await request(app()).get(path);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });
});

describe('an expired login on a page load, with the IdP up or down (MVP-2 verification, F9)', () => {
  const SEALER = cookieSealer('c'.repeat(64));
  const settings = {
    issuer: 'http://idp.test/realms/shop',
    internalUrl: 'http://127.0.0.1:1/realms/shop',
    clientId: 'shell-fes',
    clientSecret: 'secret',
  } as unknown as Idp['settings'];
  let tokenStatus = 200;
  let server: Server;
  let tokenEndpoint = '';

  beforeAll(async () => {
    // A stand-in for the IdP's token endpoint.
    const idpApp = express().post('/token', (_req, res) => {
      if (tokenStatus === 200) {
        res.json({
          access_token: 'new-at',
          token_type: 'Bearer',
          expires_in: 300,
          refresh_token: 'new-rt',
        });
      } else {
        res.status(tokenStatus).json({ error: 'invalid_grant' });
      }
    });
    server = idpApp.listen(0);
    await new Promise((done) => server.once('listening', done));
    tokenEndpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/token`;
  });
  afterAll(() => {
    server.close();
  });

  function idpUp(): Idp {
    const config = new oidc.Configuration(
      { issuer: settings.issuer, token_endpoint: tokenEndpoint },
      'shell-fes',
      'secret',
    );
    oidc.allowInsecureRequests(config);
    return { settings, config, keys: (() => undefined) as unknown as Idp['keys'] };
  }

  function appWith(idp: () => Promise<Idp>): express.Express {
    const adapter = { isAccessToken: () => true } as unknown as IdpAdapter;
    return express()
      .use(loginRoutes({ idp, adapter, publicOrigin: ORIGIN, sealer: SEALER }))
      .use(problemHandler);
  }
  const down = () => Promise.reject(new IdpUnavailableError('down'));
  const rtCookie = async () => `shop_rt=${await SEALER.seal('old-rt')}`;
  // As a browser sends it for a navigation inside the shop.
  const inShop = { 'sec-fetch-site': 'same-origin' };

  it('resume without a refresh token goes on to log in, coming back to the page', async () => {
    const res = await request(appWith(down)).get('/auth/resume?returnTo=%2Fcatalog%3Fx%3D1');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login?returnTo=%2Fcatalog%3Fx%3D1');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('resume refreshes on the server and goes back to the page, without the IdP in the browser', async () => {
    tokenStatus = 200;
    const res = await request(appWith(() => Promise.resolve(idpUp())))
      .get('/auth/resume?returnTo=%2Fcatalog')
      .set('cookie', await rtCookie())
      .set(inShop);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/catalog');
    const set = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split('=')[0]);
    expect(set).toEqual(['shop_at', 'shop_rt']);
  });

  it('resume after the IdP session ended clears the cookies and goes on to log in', async () => {
    tokenStatus = 400;
    const res = await request(appWith(() => Promise.resolve(idpUp())))
      .get('/auth/resume?returnTo=%2Fcatalog')
      .set('cookie', await rtCookie())
      .set(inShop);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login?returnTo=%2Fcatalog');
    expect((res.headers['set-cookie'] as unknown as string[]).join()).toContain('shop_rt=;');
  });

  it.each([
    ['the IdP cannot be discovered', down],
    // Port 1: nothing listens, as when the IdP's container is stopped.
    [
      'the token endpoint does not answer',
      () => {
        tokenEndpoint = 'http://127.0.0.1:1/token';
        return Promise.resolve(idpUp());
      },
    ],
  ])('resume when %s is the 503 page, Try again to the page', async (_case, idp) => {
    const saved = tokenEndpoint;
    const res = await request(appWith(idp))
      .get('/auth/resume?returnTo=%2Fcatalog%3Fx%3D1')
      .set('cookie', await rtCookie())
      .set(inShop);
    tokenEndpoint = saved;
    expect(res.status).toBe(503);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).toContain('Login cannot be checked right now');
    expect(res.text).toContain('<a href="/catalog?x=1">Try again</a>');
  });

  it.each([['none'], ['same-origin']])('resume refreshes for Sec-Fetch-Site %s', async (site) => {
    tokenStatus = 200;
    const res = await request(appWith(() => Promise.resolve(idpUp())))
      .get('/auth/resume?returnTo=%2Fcatalog')
      .set('cookie', await rtCookie())
      .set('sec-fetch-site', site);
    expect(res.headers.location).toBe('/catalog');
  });

  it.each([['cross-site'], ['same-site'], [undefined]])(
    'resume never refreshes for Sec-Fetch-Site %s: on to log in, cookies kept',
    async (site) => {
      tokenStatus = 200;
      const call = request(appWith(() => Promise.resolve(idpUp())))
        .get('/auth/resume?returnTo=%2Fcatalog')
        .set('cookie', await rtCookie());
      const res = await (site ? call.set('sec-fetch-site', site) : call);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/auth/login?returnTo=%2Fcatalog');
      expect(res.headers['set-cookie']).toBeUndefined();
    },
  );

  it.each([
    ['/auth/login?returnTo=%2Fcatalog%3Fx%3D1', '/catalog?x=1'],
    ['/auth/login', '/'],
    ['/auth/login?returnTo=https%3A%2F%2Fevil.test%2F', '/'],
  ])('%s with the IdP down is the 503 page, Try again to %s', async (path, href) => {
    // Discovered earlier, but the IdP does not answer now (internalUrl on port 1).
    const res = await request(appWith(() => Promise.resolve(idpUp()))).get(path);
    expect(res.status).toBe(503);
    expect(res.text).toContain(`<a href="${href}">Try again</a>`);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('login with the IdP never discovered is the 503 page too', async () => {
    const res = await request(appWith(down)).get('/auth/login?returnTo=%2Fcart');
    expect(res.status).toBe(503);
    expect(res.text).toContain('<a href="/cart">Try again</a>');
  });
});
