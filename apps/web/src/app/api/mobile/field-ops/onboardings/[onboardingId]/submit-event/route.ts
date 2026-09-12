import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { submitEventOnboardingCore } from "@abonten/services/fieldOps/member/eventOnboardingCore";
import { fieldOpsEventSubmitSchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/onboardings/[onboardingId]/submit-event --
// create the event under the organiser and hand it to the lead. Same
// service as submitFieldOpsEventOnboarding.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ onboardingId: string }> },
) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsEventSubmitSchema,
      params: await routeParams(ctx.params),
      label: "POST /field-ops/onboardings/[id]/submit-event",
    },
    (svc, userId, data) => submitEventOnboardingCore(svc, userId, data),
  );
}
