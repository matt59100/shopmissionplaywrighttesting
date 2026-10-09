import { test, expect } from '../fixtures';

const PRODUCT_ID = 1;

test.describe('Ajout au panier', () => {
  test('affiche un toast de confirmation et met à jour le badge panier', async ({ productPage }) => {
    await productPage.goto(PRODUCT_ID);

    // Page produit chargée
    await expect(productPage.heading).toBeVisible();
    await expect(productPage.stockStatus).toBeVisible();
    await expect(productPage.addToCartButton).toBeEnabled();

    // Panier vide au départ
    await expect(productPage.cartBadge).not.toContainText('1');

    await productPage.addToCart();

    // Toast de confirmation (indépendant du nom exact du produit)
    await expect(productPage.toast).toContainText('ajouté au panier');

    // Badge mis à jour
    await expect(productPage.cartBadge).toContainText('1');
  });

  test('retrouve le produit dans le panier après ajout (navigation SPA)', async ({ page, productPage, cartPage }) => {
    await productPage.goto(PRODUCT_ID);

    // Récupère le nom dynamiquement pour éviter la duplication
    const productName = await productPage.heading.textContent() ?? '';
    expect(productName).not.toBe('');

    await productPage.addToCart();
    await expect(productPage.toast).toContainText('ajouté au panier');

    // Navigation SPA via le header — conserve l'état React
    await productPage.goToCart();
    await expect(page).toHaveURL('/cart');

    await expect(cartPage.getItemByName(productName)).toBeVisible();
  });
});
