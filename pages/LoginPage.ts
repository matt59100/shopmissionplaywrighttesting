import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly toast: Locator;
  readonly headerAuthLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Connexion' });
    this.emailInput = page.getByTestId('login-email-input');
    this.passwordInput = page.getByTestId('login-password-input');
    this.submitButton = page.getByTestId('login-submit-button');
    this.toast = page.getByRole('region', { name: /Notifications/ }).getByRole('status').last();
    // Présent dans le header uniquement si l'utilisateur n'est pas connecté
    this.headerAuthLink = page.getByRole('banner').locator('a[href="/auth"]');
  }

  async goto() {
    await this.page.goto('/auth');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
