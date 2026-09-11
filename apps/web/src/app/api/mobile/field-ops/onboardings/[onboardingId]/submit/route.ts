import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { submitOnboardingCore } from "@abonten/services/fieldOps/member/onboardingCore";
import { fieldOpsOnboardingSubmitSchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/onboardings/:onboardingId/submit { campaignId, place,
// submissionLocation?, submissionAccuracyM?, duplicateAcknowledged? }. Same
// service as submitFieldOpsOnboarding.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  const { onboardingId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsOnboardingSubmitSchema,
      params: { onboardingId },
      label: "POST /field-ops/onboardings/[onboardingId]/submit",
    },
    (svc, userId, data) => submitOnboardingCore(svc, userId, data),
  );
}
