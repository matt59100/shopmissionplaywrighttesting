import { Page, Locator } from '@playwright/test';

export class ProductPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly stockStatus: Locator;
  readonly addToCartButton: Locator;
  readonly cartLink: Locator;
  readonly cartBadge: Locator;
  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.stockStatus = page.getByText('En stock', { exact: false });
    this.addToCartButton = page.getByTestId('product-detail-add-to-cart');
    this.cartLink = page.locator('a[href="/cart"]');
    this.cartBadge = page.locator('a[href="/cart"] button');
    // La région "Notifications" contient les toasts; on prend le dernier listitem
    this.toast = page.getByRole('region', { name: /Notifications/ }).getByRole('listitem').last();
  }

  async goto(productId: number | string) {
    await this.page.goto(`/product/${productId}`);
  }

  async addToCart() {
    await this.addToCartButton.click();
  }

  async goToCart() {
    await this.cartLink.click();
  }
}
