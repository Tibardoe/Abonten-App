import { withdrawVerificationCaseCore } from "@abonten/services/verification/verificationCaseCore";
import { withdrawVerificationSchema } from "@abonten/validation/verificationSchemas";
import { routeParams, verificationRoute } from "../../../_lib/handler";

// POST /api/mobile/verification/cases/[caseId]/withdraw
// Cancels the caller's own open verification request.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await routeParams(params);
  return verificationRoute(
    req,
    {
      schema: withdrawVerificationSchema,
      params: { caseId },
      label: "POST /verification/cases/[caseId]/withdraw",
    },
    (svc, userId, data) => withdrawVerificationCaseCore(svc, userId, data),
  );
}
