import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const app = createApp({ name: 'mock-backend', version: '0.1.0', commit: 'test', buildTime: 'now' });

describe('shell mock backend', () => {
  it('serves the greeting with a traceresponse', async () => {
    const res = await request(app).get('/greeting');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Welcome to the shop.' });
    expect(res.headers.traceresponse).toBeDefined();
  });

  it('throws on /test-error as a problem', async () => {
    const res = await request(app).get('/test-error');
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  });

  it('is ready', async () => {
    expect((await request(app).get('/health/ready')).status).toBe(200);
  });
});
