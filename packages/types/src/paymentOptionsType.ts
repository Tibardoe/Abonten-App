// What a buyer can pay one order with (payments/options on both
// transports). The market configures the methods; each saved wallet entry
// says whether it can pay there.

export type PaymentMethodCodeValue =
  | "card"
  | "mobile_money"
  | "bank_transfer"
  | "bank_redirect"
  | "apple_pay"
  | "google_pay"
  | "ussd"
  | "qr"
  | "eft"
  | "wallet";

export type AvailablePaymentMethod = {
  method: PaymentMethodCodeValue;
  provider: string;
  label: string;
  recommended: boolean;
  /** The client can save an instrument of this kind for later (momo, card). */
  savable: boolean;
  /** "popup" | "redirect" | "direct" — how the client will continue. */
  flow: "popup" | "redirect" | "direct";
};

export type SavedInstrumentOption = {
  id: string;
  usable: boolean;
  /** Charged straight away (no provider page), when usable. */
  direct: boolean;
  method: PaymentMethodCodeValue;
  /** Why it can't pay for this order, when it can't. */
  reason: string | null;
};

export type CheckoutPaymentOptions = {
  countryCode: string;
  marketName: string;
  currency: string;
  /** False when the market is paused or in maintenance: nothing can pay. */
  transacting: boolean;
  methods: AvailablePaymentMethod[];
  saved: SavedInstrumentOption[];
};
