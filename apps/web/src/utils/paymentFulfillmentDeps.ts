import activateEventPromotion from "@/utils/activateEventPromotion";
import activatePlacePromotion from "@/utils/activatePlacePromotion";
import generateTicket from "@/utils/generateTicket";
import activateContentCampaign from "@abonten/services/content/campaigns/activateContentCampaignCore";
import type { PaymentFulfillmentDeps } from "@abonten/services/payments/fulfillmentDeps";

// The concrete apps/web implementations of the three purchase-fulfilment
// steps @abonten/services/payments/finalizePayment needs injected.
// They live here (not in the package) because each uses Next primitives
// (revalidatePath / after) and renders React email templates. None of the
// three is a Server Action, so none is reachable as a public endpoint. Every Next
// context that drives payment finalisation — the verify / retry Server
// Actions, their /api/mobile route twins, and the Paystack webhook — passes
// this same object through.
export const paymentFulfillmentDeps: PaymentFulfillmentDeps = {
  issueTickets: generateTicket,
  activatePlacePromotion,
  activateEventPromotion,
  // Framework-free, so it lives in the package; still injected here so the
  // web actions, the mobile routes and the webhook all pass one object.
  activateContentCampaign,
};
