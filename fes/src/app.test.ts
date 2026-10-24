import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const version = { name: 'fes', version: '0.1.0', commit: 'test', buildTime: 'now' };

let backend: Server;
let backendUrl: string;
const clientDist = mkdtempSync(join(tmpdir(), 'shell-client-'));

beforeAll(async () => {
  writeFileSync(join(clientDist, 'index.html'), '<!doctype html><title>Shell</title>');
  mkdirSync(join(clientDist, 'assets'));
  writeFileSync(join(clientDist, 'assets', 'index-abc123.js'), 'export {};');

  const fake = express();
  fake.get('/greeting', (_req, res) => {
    res.json({ message: 'hi' });
  });
  fake.get('/test-error', (_req, res) => {
    res.status(500).type('application/problem+json').json({ status: 500 });
  });
  fake.get('/health/ready', (_req, res) => {
    res.json({ status: 'pass' });
  });
  backend = fake.listen(0);
  await new Promise((resolve) => backend.once('listening', resolve));
  backendUrl = `http://localhost:${(backend.address() as AddressInfo).port}`;
});

afterAll(() => {
  backend.close();
});

const app = () => createApp({ backendUrl, clientDist, version });

describe('shell FES API', () => {
  it('forwards the greeting from its backend', async () => {
    const res = await request(app()).get('/api/shell/greeting');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'hi' });
    expect(res.headers.traceresponse).toBeDefined();
  });

  it('throws its own test error', async () => {
    const res = await request(app()).get('/api/shell/test-error');
    expect(res.status).toBe(500);
    expect((res.body as { instance: string }).instance).toBe('/api/shell/test-error');
  });

  it('forwards the backend test error', async () => {
    const res = await request(app()).get('/api/shell/test-error?in=backend');
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  });

  it('answers unknown API routes with a 404 problem', async () => {
    const res = await request(app()).get('/api/shell/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  });
});

describe('shell FES static files', () => {
  it('serves hashed files as immutable', async () => {
    const res = await request(app()).get('/assets/index-abc123.js');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('serves the app shell for client routes, uncached', async () => {
    for (const path of ['/', '/help', '/catalog/42']) {
      const res = await request(app()).get(path);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.text).toContain('<title>Shell</title>');
    }
  });

  it('does not serve the app shell for missing assets', async () => {
    expect((await request(app()).get('/assets/missing.js.map')).status).toBe(404);
  });
});

describe('shell FES health', () => {
  it('is ready when its backend is ready', async () => {
    expect((await request(app()).get('/health/ready')).status).toBe(200);
  });

  it('is not ready when its backend is down', async () => {
    const down = createApp({ backendUrl: 'http://localhost:1', clientDist, version });
    expect((await request(down).get('/health/ready')).status).toBe(503);
  });
});
