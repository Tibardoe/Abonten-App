import { updateVerificationCaseCore } from "@abonten/services/verification/verificationCaseCore";
import { updateVerificationCaseSchema } from "@abonten/validation/verificationSchemas";
import { routeParams, verificationRoute } from "../../_lib/handler";

// POST /api/mobile/verification/cases/[caseId]
// Edits the business name, note and contact details on a draft request.
// Same service as the web updateVerificationCase Server Action.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await routeParams(params);
  return verificationRoute(
    req,
    {
      schema: updateVerificationCaseSchema,
      params: { caseId },
      label: "POST /verification/cases/[caseId]",
    },
    (svc, userId, data) => updateVerificationCaseCore(svc, userId, data),
  );
}
