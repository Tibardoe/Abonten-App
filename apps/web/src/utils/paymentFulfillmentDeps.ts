import activateEventPromotion from "@/actions/activateEventPromotion";
import activatePlacePromotion from "@/actions/activatePlacePromotion";
import generateTicket from "@/utils/generateTicket";
import type { PaymentFulfillmentDeps } from "@abonten/services/payments/fulfillmentDeps";

// The concrete apps/web implementations of the three purchase-fulfilment
// steps @abonten/services/payments/finalizePaystackPayment needs injected.
// They live here (not in the package) because each uses Next primitives
// (revalidatePath / after) and renders React email templates. Every Next
// context that drives payment finalisation — the verify / retry Server
// Actions, their /api/mobile route twins, and the Paystack webhook — passes
// this same object through.
export const paymentFulfillmentDeps: PaymentFulfillmentDeps = {
  issueTickets: generateTicket,
  activatePlacePromotion,
  activateEventPromotion,
};
