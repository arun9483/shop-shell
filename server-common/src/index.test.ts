import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  HttpError,
  backendAuth,
  forward,
  googleBackendAuth,
  healthRouter,
  notFound,
  problemHandler,
  traceResponse,
} from './index.js';

const version = { name: 'test', version: '1.0.0', commit: 'abc1234', buildTime: 'now' };

function app(ready?: () => Promise<boolean>) {
  const app = express();
  app.use(healthRouter(ready ? { version, ready } : { version }));
  app.use(traceResponse);
  app.get('/boom', () => {
    throw new Error('secret detail');
  });
  app.get('/teapot', () => {
    throw new HttpError(418, 'short and stout');
  });
  app.use(notFound);
  app.use(problemHandler);
  return app;
}

const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';

describe('traceResponse', () => {
  it('echoes the incoming trace ID in traceresponse', async () => {
    const res = await request(app()).get('/missing').set('traceparent', traceparent);
    expect(res.headers.traceresponse).toMatch(
      /^00-0af7651916cd43dd8448eb211c80319c-[0-9a-f]{16}-01$/,
    );
  });

  it('makes a trace ID when there is none', async () => {
    const res = await request(app()).get('/missing');
    expect(res.headers.traceresponse).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });
});

describe('problemHandler', () => {
  it('hides 5xx details and carries the trace ID', async () => {
    const res = await request(app()).get('/boom').set('traceparent', traceparent);
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      instance: '/boom',
      traceId: '0af7651916cd43dd8448eb211c80319c',
    });
  });

  it('shows 4xx details', async () => {
    const res = await request(app()).get('/teapot');
    expect(res.status).toBe(418);
    expect((res.body as { detail: string }).detail).toBe('short and stout');
  });

  it('answers unknown routes with 404', async () => {
    const res = await request(app()).get('/missing');
    expect(res.status).toBe(404);
  });
});

describe('healthRouter', () => {
  const health = (status: string) => ({
    status,
    version: version.version,
    releaseId: version.commit,
    serviceId: version.name,
  });

  it('is live and serves its version', async () => {
    const live = await request(app()).get('/health/live');
    expect(live.status).toBe(200);
    expect(live.headers['content-type']).toMatch(/^application\/health\+json/);
    expect(live.headers['cache-control']).toBe('no-store');
    expect(live.body).toEqual(health('pass'));
    const info = await request(app()).get('/version');
    expect(info.headers['cache-control']).toBe('no-store');
    expect(info.body).toEqual(version);
  });

  it('is not ready when its check fails or throws', async () => {
    expect((await request(app(() => Promise.resolve(false))).get('/health/ready')).status).toBe(
      503,
    );
    expect(
      (await request(app(() => Promise.reject(new Error()))).get('/health/ready')).status,
    ).toBe(503);
    expect((await request(app()).get('/health/ready')).body).toEqual(health('pass'));
    const notReady = await request(app(() => Promise.resolve(false))).get('/health/ready');
    expect(notReady.body).toEqual(health('fail'));
  });

  it('does not set traceresponse on health routes', async () => {
    const res = await request(app()).get('/health/live');
    expect(res.headers.traceresponse).toBeUndefined();
  });
});

describe('forward', () => {
  it('answers 504 when the upstream is slower than the timeout', async () => {
    const hanging = createServer(() => {
      // Never answers.
    });
    hanging.listen(0);
    await new Promise((resolve) => hanging.once('listening', resolve));
    const upstream = `http://localhost:${(hanging.address() as AddressInfo).port}`;

    const app = express();
    app.use(traceResponse);
    app.get('/slow', (_req, res) => forward(res, upstream, 100));
    app.use(problemHandler);

    const started = Date.now();
    const res = await request(app).get('/slow').set('traceparent', traceparent);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(res.status).toBe(504);
    expect(res.body).toMatchObject({
      title: 'Gateway Timeout',
      traceId: '0af7651916cd43dd8448eb211c80319c',
    });
    hanging.closeAllConnections();
    hanging.close();
  });
});

describe('googleBackendAuth', () => {
  it('gets an identity token for the backend from the metadata server, and reuses it', async () => {
    const asked: { audience: unknown; format: unknown; flavor: unknown }[] = [];
    const metadata = express();
    metadata.get('/instance/service-accounts/default/identity', (req, res) => {
      asked.push({
        audience: req.query.audience,
        format: req.query.format,
        flavor: req.get('Metadata-Flavor'),
      });
      res.send('token-123');
    });
    const server = metadata.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const url = `http://localhost:${(server.address() as AddressInfo).port}`;

    const headers = googleBackendAuth('https://shell-backend.example', url);
    expect(await headers()).toEqual({ Authorization: 'Bearer token-123' });
    expect(await headers()).toEqual({ Authorization: 'Bearer token-123' });
    expect(asked).toEqual([
      { audience: 'https://shell-backend.example', format: 'full', flavor: 'Google' },
    ]);
    server.close();
  });

  it('is off unless BACKEND_AUTH is google', async () => {
    expect(await backendAuth(undefined, 'https://x.example')()).toEqual({});
  });
});
