// Cart is not built yet. Until shop-cart is checked out next to shop-shell and built, nothing serves
// /mfe/cart/, so its routes show the Shell's fallback. Once it is, this skips and mfes.spec.ts
// covers Cart like every other MFE; Cart's own pages then go here.
import { expect, test } from '@playwright/test';
import { byName } from '../mfes.js';

const cart = byName('cart');

test.describe('cart before it is built', () => {
  test.skip(cart.available, 'shop-cart is built; mfes.spec.ts covers it');

  for (const path of ['/cart', '/cart/test-error']) {
    test(`${path} shows the Shell fallback; the Shell keeps working`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText('The cart section is unavailable')).toBeVisible();
      await page.getByRole('link', { name: 'Catalog' }).click();
      await expect(page.getByText('The cart section is unavailable')).toBeHidden();
    });
  }
});
