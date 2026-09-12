import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import {
  getPayoutDestinationCore,
  setPayoutDestinationCore,
} from "@abonten/services/fieldOps/member/payoutDestinationCore";
import {
  fieldOpsCampaignIdSchema,
  fieldOpsPayoutDestinationSchema,
} from "@abonten/validation/fieldOpsSchemas";

// GET /api/mobile/field-ops/payout-destination?campaignId= -- the caller's
// own payout details, masked. Same service as getFieldOpsPayoutDestination.
export async function GET(req: Request) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsCampaignIdSchema,
      label: "GET /field-ops/payout-destination",
    },
    (svc, userId, data) => getPayoutDestinationCore(svc, userId, data),
  );
}

// PUT /api/mobile/field-ops/payout-destination { campaignId, momoNumber,
// momoNetwork, holderName }. Same service as setFieldOpsPayoutDestination.
export async function PUT(req: Request) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsPayoutDestinationSchema,
      label: "PUT /field-ops/payout-destination",
    },
    (svc, userId, data) => setPayoutDestinationCore(svc, userId, data),
  );
}
