import { Page, Locator } from '@playwright/test';

export type ShippingInfo = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
};

export type PaymentInfo = {
  cardNumber: string;
  cardName: string;
  expiry: string;
  cvv: string;
};

export class CheckoutPage {
  readonly page: Page;

  // Affiché à la place du checkout quand l'utilisateur n'est pas connecté
  readonly loginRequiredHeading: Locator;
  readonly loginButton: Locator;

  // Étape 1 : livraison
  readonly shippingHeading: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly emailInput: Locator;
  readonly phoneInput: Locator;
  readonly addressInput: Locator;
  readonly cityInput: Locator;
  readonly postalCodeInput: Locator;
  readonly shippingSubmitButton: Locator;

  // Étape 2 : paiement
  readonly paymentHeading: Locator;
  readonly cardNumberInput: Locator;
  readonly cardNameInput: Locator;
  readonly expiryInput: Locator;
  readonly cvvInput: Locator;
  readonly paymentSubmitButton: Locator;

  // Étape 3 : confirmation
  readonly confirmationHeading: Locator;
  readonly orderNumber: Locator;

  constructor(page: Page) {
    this.page = page;

    this.loginRequiredHeading = page.getByRole('heading', { name: 'Connexion requise' });
    this.loginButton = page.getByRole('main').locator('a[href="/auth"]');

    this.shippingHeading = page.getByRole('heading', { name: 'Adresse de livraison' });
    this.firstNameInput = page.getByTestId('shipping-firstname-input');
    this.lastNameInput = page.getByTestId('shipping-lastname-input');
    this.emailInput = page.getByTestId('shipping-email-input');
    this.phoneInput = page.getByTestId('shipping-phone-input');
    this.addressInput = page.getByTestId('shipping-address-input');
    this.cityInput = page.getByTestId('shipping-city-input');
    this.postalCodeInput = page.getByTestId('shipping-postalcode-input');
    this.shippingSubmitButton = page.getByTestId('shipping-submit-button');

    this.paymentHeading = page.getByRole('heading', { name: 'Paiement sécurisé' });
    this.cardNumberInput = page.getByTestId('payment-cardnumber-input');
    this.cardNameInput = page.getByTestId('payment-cardname-input');
    this.expiryInput = page.getByTestId('payment-expiry-input');
    this.cvvInput = page.getByTestId('payment-cvv-input');
    this.paymentSubmitButton = page.getByTestId('payment-submit-button');

    this.confirmationHeading = page.getByRole('heading', { name: 'Commande confirmée !' });
    this.orderNumber = page.getByTestId('order-number');
  }

  async goToLogin() {
    await this.loginButton.click();
  }

  async fillShipping(info: ShippingInfo) {
    await this.firstNameInput.fill(info.firstName);
    await this.lastNameInput.fill(info.lastName);
    await this.emailInput.fill(info.email);
    await this.phoneInput.fill(info.phone);
    await this.addressInput.fill(info.address);
    await this.cityInput.fill(info.city);
    await this.postalCodeInput.fill(info.postalCode);
    await this.shippingSubmitButton.click();
  }

  async fillPayment(info: PaymentInfo) {
    await this.cardNumberInput.fill(info.cardNumber);
    await this.cardNameInput.fill(info.cardName);
    await this.expiryInput.fill(info.expiry);
    await this.cvvInput.fill(info.cvv);
    await this.paymentSubmitButton.click();
  }
}
