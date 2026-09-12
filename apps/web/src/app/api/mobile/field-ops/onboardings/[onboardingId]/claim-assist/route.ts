import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { submitClaimAssistCore } from "@abonten/services/fieldOps/member/claimAssistCore";
import { fieldOpsClaimAssistSchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/onboardings/[onboardingId]/claim-assist -- file
// a claim on an existing listing for the verified owner. Same service as
// submitFieldOpsClaimAssist.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ onboardingId: string }> },
) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsClaimAssistSchema,
      params: await routeParams(ctx.params),
      label: "POST /field-ops/onboardings/[id]/claim-assist",
    },
    (svc, userId, data) => submitClaimAssistCore(svc, userId, data),
  );
}
