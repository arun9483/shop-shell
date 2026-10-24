import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Records the path of every script the page loads, from now on. */
export function scripts(page: Page): string[] {
  const paths: string[] = [];
  page.on('request', (req) => {
    if (req.resourceType() === 'script') paths.push(new URL(req.url()).pathname);
  });
  return paths;
}

/** Records the origin of every request except the New Relic browser agent's own endpoints. */
export function origins(page: Page): Set<string> {
  const seen = new Set<string>();
  page.on('request', (req) => {
    const { origin, hostname } = new URL(req.url());
    if (!hostname.endsWith('.nr-data.net')) seen.add(origin);
  });
  return seen;
}

export async function expectNoAxeViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations).toEqual([]);
}

export const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
export const traceId = '0af7651916cd43dd8448eb211c80319c';
