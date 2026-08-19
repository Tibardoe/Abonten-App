import { z } from "zod";

// Mirrors receivingAcountSchema.ts / paymentMethodSchema.ts's validation
// style exactly, but this is a standalone, listable, organizer-level payout
// destination — not the per-event receiving_account form, and not a buyer
// payment_method.

const accountHolderNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must be under 100 characters")
  .regex(
    /^[a-zA-Z\s'-]+$/,
    "Name can only contain letters, spaces, apostrophes, or hyphens",
  );

// Ghana mobile numbers: local format (0XXXXXXXXX, 10 digits) or
// international (+233XXXXXXXXX) — same shape as paymentMethodSchema.ts's
// ghanaPhoneSchema.
const ghanaPhoneSchema = z
  .string()
  .trim()
  .regex(
    /^(0[0-9]{9}|\+233[0-9]{9})$/,
    "Enter a valid Ghana phone number (e.g. 024XXXXXXX or +233XXXXXXXXX)",
  );

export const addMobileMoneyPayoutAccountSchema = z.object({
  accountType: z.literal("mobile_money"),
  accountHolderName: accountHolderNameSchema,
  networkCode: z.string().min(1, "Select a mobile money network"),
  networkName: z.string().min(1, "Select a mobile money network"),
  phone: ghanaPhoneSchema,
});

export const addBankPayoutAccountSchema = z.object({
  accountType: z.literal("bank"),
  accountHolderName: accountHolderNameSchema,
  bankName: z
    .string()
    .trim()
    .min(2, "Bank name must be at least 2 characters")
    .max(100, "Bank name must be under 100 characters"),
  accountNumber: z
    .string()
    .trim()
    .min(8, "Account number must be at least 8 digits")
    .max(20, "Account number must be no more than 20 digits")
    .regex(/^[0-9]+$/, "Bank account number must contain only digits"),
});

export const addPayoutAccountSchema = z.discriminatedUnion("accountType", [
  addMobileMoneyPayoutAccountSchema,
  addBankPayoutAccountSchema,
]);

export type AddMobileMoneyPayoutAccountInput = z.infer<
  typeof addMobileMoneyPayoutAccountSchema
>;
export type AddBankPayoutAccountInput = z.infer<
  typeof addBankPayoutAccountSchema
>;
export type AddPayoutAccountInput = z.infer<typeof addPayoutAccountSchema>;
