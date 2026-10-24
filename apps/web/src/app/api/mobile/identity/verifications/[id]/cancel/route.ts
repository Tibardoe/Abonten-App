import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { cancelIdentityVerificationCore } from "@abonten/services/identity/identityCore";
import { identityVerificationIdSchema } from "@abonten/validation/identitySchemas";

// POST /api/mobile/identity/verifications/[id]/cancel
// The person stops an attempt they have not finished.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  bindLocaleFromRequest(req);
  const { id } = await params;
  const res = await discoveryRoute(
    req,
    {
      schema: identityVerificationIdSchema,
      label: "POST /identity/verifications/[id]/cancel",
      params: { verificationId: id },
    },
    ({ svc, userId, data }) =>
      cancelIdentityVerificationCore(svc, signedIn(userId), data),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
