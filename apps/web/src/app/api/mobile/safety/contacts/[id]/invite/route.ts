import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { safetyDeps } from "@/utils/sendSafetyEmail";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { resendSafetyInviteCore } from "@abonten/services/safety/safetyContactsCore";
import { safetyContactIdSchema } from "@abonten/validation/safetySchemas";

// POST /api/mobile/safety/contacts/[id]/invite
// Sends a pending contact's invite again (once a day, three times in all).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  bindLocaleFromRequest(req);
  const { id } = await params;
  const res = await discoveryRoute(
    req,
    {
      schema: safetyContactIdSchema,
      label: "POST /safety/contacts/[id]/invite",
      params: { contactId: id },
    },
    ({ svc, userId, data }) =>
      resendSafetyInviteCore(svc, signedIn(userId), data.contactId, safetyDeps),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
