import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';

let upstream: Server;
let mfeUrl: string;
const clientDir = mkdtempSync(join(tmpdir(), 'shell-stub-client-'));

beforeAll(async () => {
  writeFileSync(
    join(clientDir, 'index.html'),
    '<html><head><!--shell-stub-config--></head><body></body></html>',
  );
  mkdirSync(join(clientDir, 'assets'));
  writeFileSync(join(clientDir, 'assets', 'main-abc.js'), 'export {};');

  // A fake MFE FES that answers with the path it got.
  const fes = express();
  fes.use((req, res) => {
    res.json({ path: req.originalUrl, traceparent: req.get('traceparent') ?? null });
  });
  upstream = fes.listen(0);
  await new Promise((resolve) => upstream.once('listening', resolve));
  mfeUrl = `http://localhost:${(upstream.address() as AddressInfo).port}`;
});

afterAll(() => {
  upstream.close();
  rmSync(clientDir, { recursive: true, force: true });
});

const stub = () => createApp({ name: 'catalog', routePrefix: '/catalog', mfeUrl, clientDir });

describe('shell stub', () => {
  it.each(['/mfe/catalog/entry.js', '/api/catalog/products', '/api/catalog', '/api/catalog?x=1'])(
    'proxies %s to the MFE FES',
    async (path) => {
      const res = await request(stub()).get(path);
      expect(res.body).toEqual({ path, traceparent: null });
    },
  );

  it('passes trace headers through unchanged', async () => {
    const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const res = await request(stub()).get('/api/catalog/products').set('traceparent', traceparent);
    expect((res.body as { traceparent: string }).traceparent).toBe(traceparent);
  });

  it('serves the stub page with its config for every other page, uncached', async () => {
    for (const path of ['/', '/catalog', '/catalog/mug', '/api/catalogue']) {
      const res = await request(stub()).get(path);
      expect(res.headers['content-type']).toMatch(/^text\/html/);
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.text).toContain(
        '<script type="application/json" id="shell-stub-config">{"name":"catalog","routePrefix":"/catalog"}</script>',
      );
    }
  });

  it('serves its own files under /__stub, hashed ones as immutable', async () => {
    const res = await request(stub()).get('/__stub/assets/main-abc.js');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('cannot be broken out of its config script', async () => {
    const app = createApp({ name: '</script><b>', routePrefix: '/x', mfeUrl, clientDir });
    const res = await request(app).get('/');
    expect(res.text).not.toContain('</script><b>');
  });
});

describe('shell stub in development mode', () => {
  // Stands in for Vite's middleware: it answers MFE files with the full path it got.
  const devStub = () =>
    createApp({
      name: 'catalog',
      routePrefix: '/catalog',
      mfeUrl,
      devEntry: 'src/entry.tsx',
      devMiddleware: (req, res) => {
        res.json({ from: 'vite', path: req.originalUrl });
      },
      clientDir,
    });

  it('serves MFE files from Vite, with the base still in the path, and the API from the FES', async () => {
    expect((await request(devStub()).get('/mfe/catalog/src/entry.tsx')).body).toEqual({
      from: 'vite',
      path: '/mfe/catalog/src/entry.tsx',
    });
    expect((await request(devStub()).get('/api/catalog/products')).body).toMatchObject({
      path: '/api/catalog/products',
    });
  });

  it('tells the page which source entry to load', async () => {
    const res = await request(devStub()).get('/catalog');
    expect(res.text).toContain('"devEntry":"src/entry.tsx"');
  });
});
