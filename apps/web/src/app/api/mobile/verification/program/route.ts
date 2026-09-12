import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getVerificationProgramForUser } from "@abonten/services/verification/verificationCaseCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";

// GET /api/mobile/verification/program
// The resolved Trust & Verification switches for the caller. Ships all-off;
// the app hides the verification entry points when both are false.
// Same service as the web getVerificationProgram Server Action.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const res = await getVerificationProgramForUser(
      getSupabaseServiceClient(),
      auth.user.id,
    );
    return apiJson({ status: 200, data: res.data });
  } catch (error) {
    logger.error("mobile GET /verification/program failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
