import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { verifyOwnerOtpCore } from "@abonten/services/fieldOps/member/ownerOtpCore";
import { fieldOpsOwnerOtpVerifySchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/onboardings/:onboardingId/owner-otp/verify
// { campaignId, code }. Same service as verifyFieldOpsOwnerOtp.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  const { onboardingId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsOwnerOtpVerifySchema,
      params: { onboardingId },
      label: "POST /field-ops/onboardings/[onboardingId]/owner-otp/verify",
    },
    (svc, userId, data) => verifyOwnerOtpCore(svc, userId, data),
  );
}
