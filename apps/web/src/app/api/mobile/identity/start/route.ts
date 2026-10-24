import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { startIdentityVerificationCore } from "@abonten/services/identity/identityCore";
import { startIdentityVerificationSchema } from "@abonten/validation/identitySchemas";

// POST /api/mobile/identity/start
// Opens an attempt and answers with the provider's hosted page; the app
// opens it in the system browser.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const res = await discoveryRoute(
    req,
    {
      schema: startIdentityVerificationSchema,
      label: "POST /identity/start",
    },
    ({ svc, userId, data }) =>
      startIdentityVerificationCore(svc, signedIn(userId), data, {
        returnTo: "app",
      }),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
