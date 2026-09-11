import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import {
  listMyOnboardingsCore,
  startOnboardingCore,
} from "@abonten/services/fieldOps/member/onboardingCore";
import {
  fieldOpsOnboardingListSchema,
  fieldOpsOnboardingStartSchema,
} from "@abonten/validation/fieldOpsSchemas";

// GET /api/mobile/field-ops/onboardings?campaignId=&status= -- the caller's own
// onboardings. Same service as listMyFieldOpsOnboardings.
export async function GET(req: Request) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsOnboardingListSchema,
      label: "GET /field-ops/onboardings",
    },
    (svc, userId, data) => listMyOnboardingsCore(svc, userId, data),
  );
}

// POST /api/mobile/field-ops/onboardings { campaignId, territoryId, prospectId?,
// clientRequestId? } -- open or resume a draft. Same service as
// startFieldOpsOnboarding.
export async function POST(req: Request) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsOnboardingStartSchema,
      label: "POST /field-ops/onboardings",
    },
    (svc, userId, data) => startOnboardingCore(svc, userId, data),
  );
}
