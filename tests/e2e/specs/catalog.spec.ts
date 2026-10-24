// Catalog's own pages. What every MFE must do is in mfes.spec.ts.
import { expect, test } from '@playwright/test';
import { byName } from '../mfes.js';
import { expectNoAxeViolations, scripts } from './helpers.js';

const catalog = byName('catalog');

test.describe('catalog pages', () => {
  test.skip(!catalog.available, 'shop-catalog is not checked out next to shop-shell and built');

  test('the list loads first; the detail chunk loads on the first product visit', async ({
    page,
  }) => {
    const loaded = scripts(page);
    await page.goto('/catalog');
    await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible();
    expect(loaded.some((path) => /\/mfe\/catalog\/assets\/ProductList-/.test(path))).toBe(true);
    expect(loaded.some((path) => /\/ProductDetail-/.test(path))).toBe(false);

    await page.getByRole('link', { name: 'Stoneware mug' }).click();
    await expect(page.getByRole('heading', { name: 'Stoneware mug' })).toBeVisible();
    expect(page.url()).toMatch(/\/catalog\/mug$/);
    expect(loaded.filter((path) => /\/ProductDetail-/.test(path))).toHaveLength(1);

    await page.getByRole('link', { name: 'Back to the catalog' }).click();
    await page.getByRole('link', { name: 'Steel kettle' }).click();
    await expect(page.getByRole('heading', { name: 'Steel kettle' })).toBeVisible();
    expect(loaded.filter((path) => /\/ProductDetail-/.test(path))).toHaveLength(1);
  });

  test('a deep link opens a product; an unknown one says so', async ({ page }) => {
    await page.goto('/catalog/teapot');
    await expect(page.getByRole('heading', { name: 'Glass teapot' })).toBeVisible();
    await page.goto('/catalog/nope');
    await expect(page.getByRole('heading', { name: 'Product not found' })).toBeVisible();
  });

  test('/catalog/mug has no WCAG 2.2 AA violations', async ({ page }) => {
    await page.goto('/catalog/mug');
    await expect(page.getByRole('heading', { name: 'Stoneware mug' })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
