import { requestVerificationEvidenceUploadCore } from "@abonten/services/verification/verificationCaseCore";
import { evidenceUploadRequestSchema } from "@abonten/validation/verificationSchemas";
import { routeParams, verificationRoute } from "../../../_lib/handler";

// POST /api/mobile/verification/cases/[caseId]/evidence
// Mints a one-shot signed upload ticket for the private
// verification-evidence bucket. The app then does
// storage.from(bucket).uploadToSignedUrl(path, token, bytes). The bucket has
// no storage policies: this ticket is the authorization, and it is issued
// only after the service confirmed the caller owns this case.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await routeParams(params);
  return verificationRoute(
    req,
    {
      schema: evidenceUploadRequestSchema,
      params: { caseId },
      label: "POST /verification/cases/[caseId]/evidence",
    },
    (svc, userId, data) =>
      requestVerificationEvidenceUploadCore(svc, userId, data),
  );
}
