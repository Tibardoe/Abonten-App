import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { getOnboardingDraftCore } from "@abonten/services/fieldOps/member/onboardingCore";
import { fieldOpsOnboardingRefSchema } from "@abonten/validation/fieldOpsSchemas";

// GET /api/mobile/field-ops/onboardings/:onboardingId?campaignId= -- the wizard's
// resume state. Same service as getFieldOpsOnboardingDraft.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  const { onboardingId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsOnboardingRefSchema,
      params: { onboardingId },
      label: "GET /field-ops/onboardings/[onboardingId]",
    },
    (svc, userId, data) => getOnboardingDraftCore(svc, userId, data),
  );
}
