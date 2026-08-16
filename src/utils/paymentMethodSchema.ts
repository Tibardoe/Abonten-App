import { z } from "zod";

// Kept in sync with src/utils/networkProviderData.ts's `networks` list.
export const MOMO_NETWORKS = [
  "AT Money",
  "G-Money",
  "MTN Mobile Money",
  "Telecel Cash",
] as const;

export const CARD_BRANDS = ["Visa", "Mastercard"] as const;

// Deliberately narrow: only non-sensitive, display-safe fields the user
// types themselves. No full card/PIN/mobile-money number is ever collected —
// there is no tokenization provider behind this yet (see AddMomoWallet.tsx /
// AddBankCard.tsx for the user-facing note explaining this).
const last4Schema = z
  .string()
  .trim()
  .regex(/^[0-9]{4}$/, "Enter the last 4 digits only");

const labelSchema = z
  .string()
  .trim()
  .max(40, "Label must be under 40 characters")
  .optional()
  .or(z.literal(""));

export const addMomoWalletSchema = z.object({
  type: z.literal("momo"),
  network: z.enum(MOMO_NETWORKS, {
    invalid_type_error: "Select a mobile money network",
  }),
  last4: last4Schema,
  label: labelSchema,
});

export const addBankCardSchema = z.object({
  type: z.literal("card"),
  brand: z.enum(CARD_BRANDS, {
    invalid_type_error: "Select a card brand",
  }),
  last4: last4Schema,
  expiryMonth: z
    .number({ invalid_type_error: "Enter the expiry month" })
    .int()
    .min(1, "Invalid month")
    .max(12, "Invalid month"),
  expiryYear: z
    .number({ invalid_type_error: "Enter the expiry year" })
    .int()
    .min(new Date().getFullYear(), "This card has already expired"),
  label: labelSchema,
});

export const addPaymentMethodSchema = z.discriminatedUnion("type", [
  addMomoWalletSchema,
  addBankCardSchema,
]);

export type AddMomoWalletInput = z.infer<typeof addMomoWalletSchema>;
export type AddBankCardInput = z.infer<typeof addBankCardSchema>;
export type AddPaymentMethodInput = z.infer<typeof addPaymentMethodSchema>;
