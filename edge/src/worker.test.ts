import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { mfeRoutes } from './worker.js';

const env = {
  SHELL_URL: 'https://shell.example',
  MFE_CATALOG_URL: 'https://catalog.example',
  MFE_CART_URL: 'https://cart.example',
};

/** Sends `path` through the Worker and returns the request it forwarded. */
async function forwarded(path: string, init?: RequestInit): Promise<Request> {
  const upstream = vi.fn((input: URL, options: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify({ url: input.href, options }))),
  );
  vi.stubGlobal('fetch', upstream);
  await worker.fetch(new Request(`https://shop.example${path}`, init), env);
  const [input, options] = upstream.mock.calls[0] ?? [];
  return new Request(input ?? '', options);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mfeRoutes', () => {
  it('reads MFE_<NAME>_URL variables', () => {
    expect(mfeRoutes(env)).toEqual([
      { name: 'catalog', url: 'https://catalog.example' },
      { name: 'cart', url: 'https://cart.example' },
    ]);
  });
});

describe('worker', () => {
  it.each([
    ['/mfe/catalog/entry.js', 'https://catalog.example/mfe/catalog/entry.js'],
    ['/api/catalog/products', 'https://catalog.example/api/catalog/products'],
    ['/api/catalog?page=2', 'https://catalog.example/api/catalog?page=2'],
    ['/api/cart', 'https://cart.example/api/cart'],
    ['/api/catalogue', 'https://shell.example/api/catalogue'],
    ['/catalog/42', 'https://shell.example/catalog/42'],
    ['/api/shell/greeting', 'https://shell.example/api/shell/greeting'],
    ['/mfe/catalogue/entry.js', 'https://shell.example/mfe/catalogue/entry.js'],
    ['/', 'https://shell.example/'],
  ])('routes %s to %s', async (path, target) => {
    expect((await forwarded(path)).url).toBe(target);
  });

  it('passes trace headers through and says where the request came in', async () => {
    const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const req = await forwarded('/api/catalog/products', { headers: { traceparent } });
    expect(req.headers.get('traceparent')).toBe(traceparent);
    expect(req.headers.get('x-forwarded-host')).toBe('shop.example');
    expect(req.headers.get('x-forwarded-proto')).toBe('https');
  });

  it('does not expose health or version', async () => {
    for (const path of ['/health/live', '/health', '/version']) {
      const res = await worker.fetch(new Request(`https://shop.example${path}`), env);
      expect(res.status).toBe(404);
    }
  });
});
