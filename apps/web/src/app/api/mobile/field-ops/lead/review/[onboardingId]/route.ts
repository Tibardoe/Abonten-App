import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { reviewOnboardingCore } from "@abonten/services/fieldOps/lead/reviewCore";
import { fieldOpsReviewSchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/lead/review/:onboardingId { campaignId, decision,
// note? }. Same service as reviewFieldOpsOnboarding.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  const { onboardingId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsReviewSchema,
      params: { onboardingId },
      label: "POST /field-ops/lead/review/[onboardingId]",
    },
    (svc, userId, data) => reviewOnboardingCore(svc, userId, data),
  );
}
