import { z } from "zod";

const labelSchema = z
  .string()
  .trim()
  .max(40, "Label must be under 40 characters")
  .optional()
  .or(z.literal(""));

// Ghana mobile numbers: local format (0XXXXXXXXX, 10 digits) or
// international (+233XXXXXXXXX). Normalized to the +233 form before being
// sent to Paystack's Charge API — see phoneNumberFormatter.ts.
const ghanaPhoneSchema = z
  .string()
  .trim()
  .regex(
    /^(0[0-9]{9}|\+233[0-9]{9})$/,
    "Enter a valid Ghana phone number (e.g. 024XXXXXXX or +233XXXXXXXXX)",
  );

// User-submitted form: real phone number + a network chosen from Paystack's
// live-fetched mobile money provider list (getPaystackMobileMoneyNetworks.ts)
// rather than a hardcoded guess at what Paystack supports.
export const addMomoWalletSchema = z.object({
  type: z.literal("momo"),
  networkCode: z.string().min(1, "Select a mobile money network"),
  networkName: z.string().min(1),
  phone: ghanaPhoneSchema,
  label: labelSchema,
});

// NOT a user-submitted form: a card is never typed in directly (no PAN/CVV
// collection — PCI compliance and this repo's explicit rule). This shape is
// constructed server-side from Paystack's own verified charge response
// (see confirmCardVerification.ts) after a real GHS 1 verification charge
// captures a reusable authorization_code. Still zod-validated as a safety
// net against a malformed/unexpected Paystack response shape.
export const cardPaymentMethodSchema = z.object({
  type: z.literal("card"),
  brand: z.string().min(1),
  last4: z.string().regex(/^[0-9]{4}$/),
  expiryMonth: z.number().int().min(1).max(12),
  expiryYear: z.number().int(),
  authorizationCode: z.string().min(1),
  bank: z.string().nullable().optional(),
  label: labelSchema,
});

export const addPaymentMethodSchema = z.discriminatedUnion("type", [
  addMomoWalletSchema,
  cardPaymentMethodSchema,
]);

export type AddMomoWalletInput = z.infer<typeof addMomoWalletSchema>;
export type CardPaymentMethodInput = z.infer<typeof cardPaymentMethodSchema>;
export type AddPaymentMethodInput = z.infer<typeof addPaymentMethodSchema>;
