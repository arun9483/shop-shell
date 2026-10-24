// MVP criterion 11: an FES's readiness fails when its mock backend is down, and recovers when it is
// back. Each unit gets its own backend and FES on spare ports, so the running stack is untouched.
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { mfes } from '../mfes.js';
import { start, stopAll, untilUp } from './helpers.js';

const units = [
  { name: 'shell', dir: resolve(import.meta.dirname, '../../..'), available: true },
  ...mfes,
];

test.afterAll(stopAll);

for (const [index, unit] of units.entries()) {
  test(`${unit.name}: the FES is not ready while its backend is down`, async ({ request }) => {
    test.skip(!unit.available, `shop-${unit.name} is not checked out next to shop-shell and built`);

    const backendPort = String(4400 + index);
    const fes = `http://localhost:${3400 + index}`;
    const startBackend = () => start(`${unit.dir}/mock-backend`, { PORT: backendPort });

    const backend = startBackend();
    start(`${unit.dir}/fes`, {
      PORT: String(3400 + index),
      BACKEND_URL: `http://localhost:${backendPort}`,
      CLIENT_DIST: `${unit.dir}/client/dist`,
    });
    await untilUp(`${fes}/health/ready`);

    backend.kill();
    await expect.poll(async () => (await request.get(`${fes}/health/ready`)).status()).toBe(503);
    const notReady = await request.get(`${fes}/health/ready`);
    expect(notReady.headers()['content-type']).toMatch(/^application\/health\+json/);
    expect(await notReady.json()).toEqual({ status: 'fail' });
    // Still live: only readiness depends on the backend.
    expect((await request.get(`${fes}/health/live`)).status()).toBe(200);

    startBackend();
    await expect.poll(async () => (await request.get(`${fes}/health/ready`)).status()).toBe(200);
  });
}
