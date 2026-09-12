import { removeVerificationEvidenceCore } from "@abonten/services/verification/verificationCaseCore";
import { removeEvidenceSchema } from "@abonten/validation/verificationSchemas";
import { routeParams, verificationRoute } from "../../../../../_lib/handler";

// POST /api/mobile/verification/cases/[caseId]/evidence/[evidenceId]/delete
// Removes one attached document and its bytes from a draft request.
// POST rather than DELETE to match the rest of the mobile API surface.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ caseId: string; evidenceId: string }> },
) {
  const { caseId, evidenceId } = await routeParams(params);
  return verificationRoute(
    req,
    {
      schema: removeEvidenceSchema,
      params: { caseId, evidenceId },
      label: "POST /verification/cases/[caseId]/evidence/[evidenceId]/delete",
    },
    (svc, userId, data) => removeVerificationEvidenceCore(svc, userId, data),
  );
}
