import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  HttpError,
  forward,
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
  it('is live and serves its version', async () => {
    const live = await request(app()).get('/health/live');
    expect(live.status).toBe(200);
    expect(live.headers['content-type']).toMatch(/^application\/health\+json/);
    expect(live.body).toEqual({ status: 'pass' });
    expect((await request(app()).get('/version')).body).toEqual(version);
  });

  it('is not ready when its check fails or throws', async () => {
    expect((await request(app(() => Promise.resolve(false))).get('/health/ready')).status).toBe(
      503,
    );
    expect(
      (await request(app(() => Promise.reject(new Error()))).get('/health/ready')).status,
    ).toBe(503);
    expect((await request(app()).get('/health/ready')).body).toEqual({ status: 'pass' });
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
