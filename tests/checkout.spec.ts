import { test, expect } from '../fixtures';

const PRODUCT_ID = 1;

test.describe('Checkout', () => {
  test('utilisateur connecté : ajout au panier puis commande complète', async ({
    loggedIn,
    productPage,
    cartPage,
    checkoutPage,
  }) => {
    // 1. Ajout au panier (utilisateur déjà connecté via la fixture loggedIn)
    await productPage.goto(PRODUCT_ID);
    const productName = await productPage.heading.textContent() ?? '';
    expect(productName).not.toBe('');

    await productPage.addToCart();
    await expect(productPage.toast).toContainText('ajouté au panier');
    await expect(productPage.cartBadge).toContainText('1');

    // 2. Panier puis checkout — navigation SPA pour conserver le panier
    await productPage.goToCart();
    await expect(cartPage.getItemByName(productName)).toBeVisible();
    await cartPage.checkout();

    // 3. Livraison
    await expect(checkoutPage.shippingHeading).toBeVisible();
    await checkoutPage.fillShipping({
      firstName: 'Matthieu',
      lastName: 'Bridoux',
      email: process.env.TEST_USER_EMAIL!,
      phone: '0612345678',
      address: '10 rue de la Paix',
      city: 'Paris',
      postalCode: '75002',
    });

    // 4. Paiement (carte de test fictive)
    await expect(checkoutPage.paymentHeading).toBeVisible();
    await checkoutPage.fillPayment({
      cardNumber: '4242 4242 4242 4242',
      cardName: 'Matthieu Bridoux',
      expiry: '12/30',
      cvv: '123',
    });

    // 5. Confirmation
    await expect(checkoutPage.confirmationHeading).toBeVisible();
    await expect(checkoutPage.orderNumber).toHaveText(/^#TH-[A-Z0-9]+$/);
    await expect(productPage.cartBadge).not.toContainText('1');
  });
});
