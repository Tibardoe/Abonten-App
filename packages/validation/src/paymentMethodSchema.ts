import { z } from "zod";

const labelSchema = z
  .string()
  .trim()
  .max(40, "Label must be under 40 characters")
  .optional()
  .or(z.literal(""));

// The wallet's phone number, in the person's own market's format: a local
// number ("024 123 4567", "0712 345678") or an international one
// ("+254712345678"). This only checks it looks like a phone number; the
// service parses it against the person's market (@abonten/core/phone,
// libphonenumber) and stores one E.164 form, so a Kenyan M-Pesa number is
// as valid as a Ghanaian MTN one.
const walletPhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 ()-]{5,19}$/, "Enter a valid mobile money number");

// User-submitted form: real phone number + a network chosen from the
// provider's live-fetched mobile money list for the person's market
// (mobileMoneyNetworksCore) rather than a hardcoded guess.
export const addMomoWalletSchema = z.object({
  type: z.literal("momo"),
  networkCode: z.string().min(1, "Select a mobile money network"),
  networkName: z.string().min(1),
  phone: walletPhoneSchema,
  label: labelSchema,
});

// NOT a user-submitted form: a card is never typed in directly (no PAN/CVV
// collection — PCI compliance and this repo's explicit rule). This shape is
// constructed server-side from the provider's own verified charge response
// (cardVerificationCore) after a small, refunded verification charge in the
// person's market currency captures a reusable token. `provider` and
// `countryCode` record which provider ACCOUNT issued the token: it can only
// be charged by that account (paymentChoice.ts). Still zod-validated as a
// safety net against a malformed provider response.
export const cardPaymentMethodSchema = z.object({
  type: z.literal("card"),
  brand: z.string().min(1),
  last4: z.string().regex(/^[0-9]{4}$/),
  expiryMonth: z.number().int().min(1).max(12),
  expiryYear: z.number().int(),
  authorizationCode: z.string().min(1),
  bank: z.string().nullable().optional(),
  provider: z.string().min(1).optional(),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  label: labelSchema,
});

export const addPaymentMethodSchema = z.discriminatedUnion("type", [
  addMomoWalletSchema,
  cardPaymentMethodSchema,
]);

export type AddMomoWalletInput = z.infer<typeof addMomoWalletSchema>;
export type CardPaymentMethodInput = z.infer<typeof cardPaymentMethodSchema>;
export type AddPaymentMethodInput = z.infer<typeof addPaymentMethodSchema>;
