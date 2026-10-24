// Cart's own pages. What every MFE must do is in mfes.spec.ts.
import { expect, test } from '@playwright/test';
import { byName } from '../mfes.js';
import { scripts } from './helpers.js';

const cart = byName('cart');

test.describe('cart pages', () => {
  test.skip(!cart.available, 'shop-cart is not checked out next to shop-shell and built');

  test('the cart loads from its backend as a lazy chunk', async ({ page }) => {
    const loaded = scripts(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    expect(loaded.some((path) => /\/CartPage-/.test(path))).toBe(false);

    await page.getByRole('link', { name: 'Cart' }).click();
    await expect(page.getByRole('heading', { name: 'Cart' })).toBeVisible();
    await expect(page.getByText(/Total: ₹2,197/)).toBeVisible();
    expect(loaded.filter((path) => /\/mfe\/cart\/assets\/CartPage-/.test(path))).toHaveLength(1);
  });

  test('an item opens its product in Catalog by URL alone', async ({ page }) => {
    test.skip(!byName('catalog').available, 'shop-catalog is not built');
    await page.goto('/cart');
    await page.getByRole('link', { name: 'Stoneware mug' }).click();
    await expect(page).toHaveURL(/\/catalog\/mug$/);
    await expect(page.getByRole('heading', { name: 'Stoneware mug' })).toBeVisible();
  });
});

// Until shop-cart is checked out next to shop-shell and built, nothing serves /mfe/cart/, so its
// routes show the Shell's fallback.
test.describe('cart before it is built', () => {
  test.skip(cart.available, 'shop-cart is built');

  for (const path of ['/cart', '/cart/test-error']) {
    test(`${path} shows the Shell fallback; the Shell keeps working`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText('The cart section is unavailable')).toBeVisible();
      await page.getByRole('link', { name: 'Catalog' }).click();
      await expect(page.getByText('The cart section is unavailable')).toBeHidden();
    });
  }
});
