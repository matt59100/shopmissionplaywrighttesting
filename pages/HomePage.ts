import { Page, Locator } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  readonly heroHeading: Locator;
  readonly navProducts: Locator;
  readonly cartLink: Locator;
  readonly cartBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heroHeading = page.getByRole('heading', { level: 1 });
    this.navProducts = page.getByRole('navigation').getByRole('link', { name: 'Produits' });
    this.cartLink = page.locator('a[href="/cart"]');
    this.cartBadge = page.locator('a[href="/cart"] button');
  }

  async goto() {
    await this.page.goto('/');
  }

  async goToProducts() {
    await this.navProducts.click();
  }

  async goToCart() {
    await this.cartLink.click();
  }
}
