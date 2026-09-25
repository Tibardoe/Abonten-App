import { z } from "zod";

// An organizer's payout destination, for any market. The shape is the
// same everywhere — who the account belongs to, which rail, which market —
// and the rail-specific fields (sort code, routing number, IBAN, branch
// code…) travel in `details`, validated by the service against the market's
// payout method rules (market_payout_method.fields). Phone numbers are
// validated per country with libphonenumber in the service, not here.

const accountHolderNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must be under 100 characters")
  .regex(
    /^[\p{L}\s'.-]+$/u,
    "Name can only contain letters, spaces, apostrophes, full stops or hyphens",
  );

const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Choose a country")
  .optional();

// Optional without a default so the form's input and output types agree
// (react-hook-form's resolver needs them to); the service treats a missing
// `details` as {}.
const detailsSchema = z
  .record(z.string(), z.string().trim().max(120))
  .optional();

export const addMobileMoneyPayoutAccountSchema = z.object({
  accountType: z.literal("mobile_money"),
  /** The market the account belongs to; defaults to the organizer's home market. */
  countryCode: countryCodeSchema,
  accountHolderName: accountHolderNameSchema,
  /** Provider network code (from the market's mobile money network list). */
  networkCode: z.string().trim().min(1, "Select a mobile money network"),
  networkName: z.string().trim().min(1, "Select a mobile money network"),
  /** As typed; normalised to E.164 for the market's country by the service. */
  phone: z.string().trim().min(6, "Enter the mobile money number"),
  details: detailsSchema,
});

export const addBankPayoutAccountSchema = z.object({
  accountType: z.literal("bank"),
  countryCode: countryCodeSchema,
  accountHolderName: accountHolderNameSchema,
  bankName: z
    .string()
    .trim()
    .min(2, "Bank name must be at least 2 characters")
    .max(100, "Bank name must be under 100 characters"),
  /** Provider bank code when the market's provider lists banks. */
  bankCode: z.string().trim().max(40).optional(),
  accountNumber: z
    .string()
    .trim()
    .min(4, "Enter the account number")
    .max(34, "Account number is too long")
    .regex(
      /^[A-Za-z0-9 ]+$/,
      "Account number can only contain letters and digits",
    ),
  /** Rail-specific fields: sortCode, routingNumber, iban, bic, branchCode… */
  details: detailsSchema,
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
