import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { requestEvidenceUploadCore } from "@abonten/services/fieldOps/member/evidenceCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { fieldOpsEvidenceRequestSchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/onboardings/:onboardingId/evidence { campaignId, kind,
// mimeType, sizeBytes, capturedAt?, location?, accuracyM? } -- a signed upload
// ticket. Same service as requestFieldOpsEvidenceUpload.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  bindLocaleFromRequest(req);
  const { onboardingId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsEvidenceRequestSchema,
      params: { onboardingId },
      label: "POST /field-ops/onboardings/[onboardingId]/evidence",
    },
    (svc, userId, data) => requestEvidenceUploadCore(svc, userId, data),
  );
}
