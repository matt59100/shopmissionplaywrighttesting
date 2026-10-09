import { test as base, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { ProductListPage } from '../pages/ProductListPage';
import { ProductPage } from '../pages/ProductPage';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage } from '../pages/CheckoutPage';
import { LoginPage } from '../pages/LoginPage';

type PageFixtures = {
  homePage: HomePage;
  productListPage: ProductListPage;
  productPage: ProductPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
  loginPage: LoginPage;
  // Connecte l'utilisateur de test à la demande, en cours de test (identifiants via TEST_USER_EMAIL / TEST_USER_PASSWORD).
  // Si on est déjà sur /auth (arrivé par un clic), la page n'est pas rechargée : l'état React (panier) est conservé.
  login: () => Promise<void>;
  // Connecte l'utilisateur de test avant le test
  loggedIn: void;
};

export const test = base.extend<PageFixtures>({
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  productListPage: async ({ page }, use) => {
    await use(new ProductListPage(page));
  },
  productPage: async ({ page }, use) => {
    await use(new ProductPage(page));
  },
  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },
  checkoutPage: async ({ page }, use) => {
    await use(new CheckoutPage(page));
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  login: async ({ page, loginPage }, use) => {
    const email = process.env.TEST_USER_EMAIL;
    const password = process.env.TEST_USER_PASSWORD;
    if (!email || !password) {
      throw new Error('TEST_USER_EMAIL et TEST_USER_PASSWORD doivent être définis (fichier .env) pour utiliser la fixture login');
    }

    await use(async () => {
      if (!new URL(page.url(), 'http://x').pathname.startsWith('/auth')) {
        await loginPage.goto();
      }
      await loginPage.login(email, password);

      // Connexion réussie : toast de confirmation, redirection vers l'accueil, lien de connexion retiré du header
      await expect(loginPage.toast).toContainText('Connexion réussie');
      await expect(page).toHaveURL('/');
      await expect(loginPage.headerAuthLink).toHaveCount(0);
    });
  },
  loggedIn: async ({ login }, use) => {
    await login();
    await use();
  },
});

export { expect };
