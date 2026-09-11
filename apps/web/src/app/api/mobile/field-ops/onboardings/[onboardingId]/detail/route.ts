import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { getOnboardingDetailCore } from "@abonten/services/fieldOps/member/onboardingCore";
import { fieldOpsOnboardingRefSchema } from "@abonten/validation/fieldOpsSchemas";

// GET /api/mobile/field-ops/onboardings/:onboardingId/detail?campaignId= -- full
// detail for the member or their lead. Same service as getFieldOpsOnboardingDetail.
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
      label: "GET /field-ops/onboardings/[onboardingId]/detail",
    },
    (svc, userId, data) => getOnboardingDetailCore(svc, userId, data),
  );
}
