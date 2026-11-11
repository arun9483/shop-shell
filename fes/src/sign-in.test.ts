import { cookieSealer, problemHandler, type IdpAdapter } from '@shop-shell/server-common';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { safeReturnTo, signInRoutes } from './sign-in.js';

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
  const routes = signInRoutes({
    idp: idp,
    adapter,
    publicOrigin: ORIGIN,
    sealer: cookieSealer('c'.repeat(64)),
  });
  return express().use(routes).use(problemHandler);
}

describe('sign-in routes', () => {
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
