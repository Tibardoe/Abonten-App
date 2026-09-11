import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { requestOwnerOtpCore } from "@abonten/services/fieldOps/member/ownerOtpCore";
import { fieldOpsOwnerOtpRequestSchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/onboardings/:onboardingId/owner-otp { campaignId,
// ownerFullName, ownerPhoneE164 } -- send the owner's code. Same service as
// requestFieldOpsOwnerOtp.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  const { onboardingId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsOwnerOtpRequestSchema,
      params: { onboardingId },
      label: "POST /field-ops/onboardings/[onboardingId]/owner-otp",
    },
    (svc, userId, data) => requestOwnerOtpCore(svc, userId, data),
  );
}
