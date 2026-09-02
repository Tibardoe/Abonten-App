import type { AuthOverride } from "@abonten/types/authOverrideType";

// The three purchase-fulfilment steps finalizePaystackPayment runs once a
// Paystack charge is verified. They stay in apps/web because they use Next
// primitives (revalidatePath, after) and render React email templates
// (Resend); this framework-free payment core receives them as injected
// dependencies from whichever Next context (Server Action or route handler)
// is driving the finalisation. Every step is idempotent and priced entirely
// server-side from the referenced checkout row — never from the client.

type FulfilmentResult = { status: number; message?: string };

export type PaymentFulfillmentDeps = {
  /** src/actions/generateTicket.ts — issue tickets for a paid checkout session. */
  issueTickets: (
    checkoutSessionId: string,
    transactionId: string,
    transactionMetadata: string,
    authOverride: AuthOverride,
  ) => Promise<FulfilmentResult>;
  /** src/actions/activatePlacePromotion.ts */
  activatePlacePromotion: (
    checkoutId: string,
    authOverride: AuthOverride,
  ) => Promise<FulfilmentResult>;
  /** src/actions/activateEventPromotion.ts */
  activateEventPromotion: (
    checkoutId: string,
    authOverride: AuthOverride,
  ) => Promise<FulfilmentResult>;
};
