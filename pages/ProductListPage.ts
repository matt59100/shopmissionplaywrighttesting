import { Page, Locator } from '@playwright/test';

export class ProductListPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly productCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.productCards = page.getByRole('link').filter({ has: page.getByRole('heading', { level: 3 }) });
  }

  async goto() {
    await this.page.goto('/products');
  }

  async openProductById(id: number | string) {
    await this.page.goto(`/product/${id}`);
  }

  async openProductByName(name: string) {
    await this.page.getByRole('link', { name }).first().click();
  }
}
