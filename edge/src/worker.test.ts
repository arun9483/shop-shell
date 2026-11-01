import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';

const env = { ROUTER_URL: 'https://router.example' };

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

describe('worker', () => {
  it.each([
    '/',
    '/catalog/42',
    '/mfe/catalog/entry.js',
    '/api/catalog/products',
    '/api/catalog?page=2',
    '/api/shell/greeting',
    '/health/units',
    '/version',
  ])('forwards %s to the router', async (path) => {
    expect((await forwarded(path)).url).toBe(`https://router.example${path}`);
  });

  it('passes trace headers through and says where the request came in', async () => {
    const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const req = await forwarded('/api/catalog/products', { headers: { traceparent } });
    expect(req.headers.get('traceparent')).toBe(traceparent);
    expect(req.headers.get('x-forwarded-host')).toBe('shop.example');
    expect(req.headers.get('x-forwarded-proto')).toBe('https');
  });

  it('fails plainly without a router', async () => {
    await expect(worker.fetch(new Request('https://shop.example/'), {})).rejects.toThrow(
      'ROUTER_URL is not set',
    );
  });
});
