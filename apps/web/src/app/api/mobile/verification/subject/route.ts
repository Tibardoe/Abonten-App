import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { getSubjectVerificationCore } from "@abonten/services/verification/verificationCaseCore";
import { verificationSubjectSchema } from "@abonten/validation/verificationSchemas";
import { verificationRoute } from "../_lib/handler";

// GET /api/mobile/verification/subject?subjectType=place&subjectId=…
// Everything one subject's verification screen needs: the live approval, the
// case the owner can still act on, the last closed one, and the programme
// limits. Same service as the web getSubjectVerification Server Action.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return verificationRoute(
    req,
    { schema: verificationSubjectSchema, label: "GET /verification/subject" },
    (svc, userId, data) => getSubjectVerificationCore(svc, userId, data),
  );
}
