import { submitVerificationCaseCore } from "@abonten/services/verification/verificationCaseCore";
import { submitVerificationSchema } from "@abonten/validation/verificationSchemas";
import { routeParams, verificationRoute } from "../../../_lib/handler";

// POST /api/mobile/verification/cases/[caseId]/submit
// Sends a draft, or a case sent back for more information, to review. The
// service confirms every uploaded object actually landed first.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await routeParams(params);
  return verificationRoute(
    req,
    {
      schema: submitVerificationSchema,
      params: { caseId },
      label: "POST /verification/cases/[caseId]/submit",
    },
    (svc, userId, data) => submitVerificationCaseCore(svc, userId, data),
  );
}
