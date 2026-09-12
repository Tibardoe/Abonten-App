import { startVerificationCaseCore } from "@abonten/services/verification/verificationCaseCore";
import { startVerificationSchema } from "@abonten/validation/verificationSchemas";
import { verificationRoute } from "../_lib/handler";

// POST /api/mobile/verification/cases
// Opens a draft verification request for a place the caller owns, or for
// their own organizer profile. Same service as the web
// startVerificationCase Server Action.
export async function POST(req: Request) {
  return verificationRoute(
    req,
    { schema: startVerificationSchema, label: "POST /verification/cases" },
    (svc, userId, data) => startVerificationCaseCore(svc, userId, data),
  );
}
