import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { withdrawOnboardingCore } from "@abonten/services/fieldOps/member/onboardingCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { fieldOpsOnboardingWithdrawSchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/onboardings/:onboardingId/withdraw { campaignId,
// reason? }. Same service as withdrawFieldOpsOnboarding.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  bindLocaleFromRequest(req);
  const { onboardingId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsOnboardingWithdrawSchema,
      params: { onboardingId },
      label: "POST /field-ops/onboardings/[onboardingId]/withdraw",
    },
    (svc, userId, data) => withdrawOnboardingCore(svc, userId, data),
  );
}
