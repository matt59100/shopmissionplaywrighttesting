import { Page, Locator } from '@playwright/test';

export class CartPage {
  readonly page: Page;
  readonly emptyStateHeading: Locator;
  readonly cartBadge: Locator;
  readonly checkoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emptyStateHeading = page.getByRole('heading', { name: 'Votre panier est vide' });
    this.cartBadge = page.locator('a[href="/cart"] button');
    this.checkoutButton = page.getByTestId('checkout-button');
  }

  async goto() {
    await this.page.goto('/cart');
  }

  async checkout() {
    await this.checkoutButton.click();
  }

  getItemByName(name: string): Locator {
    return this.page.getByRole('main').getByText(name, { exact: true });
  }
}
