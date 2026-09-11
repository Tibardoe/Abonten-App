import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { removeEvidenceCore } from "@abonten/services/fieldOps/member/evidenceCore";
import { fieldOpsEvidenceRemoveSchema } from "@abonten/validation/fieldOpsSchemas";

// DELETE /api/mobile/field-ops/onboardings/:onboardingId/evidence/:evidenceId
// { campaignId }. Same service as removeFieldOpsEvidence.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ onboardingId: string; evidenceId: string }> },
) {
  const { onboardingId, evidenceId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsEvidenceRemoveSchema,
      params: { onboardingId, evidenceId },
      label:
        "DELETE /field-ops/onboardings/[onboardingId]/evidence/[evidenceId]",
    },
    (svc, userId, data) => removeEvidenceCore(svc, userId, data),
  );
}
