import { discoveryRoute, signedIn } from "@/app/api/mobile/_lib/discoveryRoute";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import {
  removeSafetyContactCore,
  updateSafetyContactCore,
} from "@abonten/services/safety/safetyContactsCore";
import {
  safetyContactIdSchema,
  updateSafetyContactSchema,
} from "@abonten/validation/safetySchemas";

// PATCH /api/mobile/safety/contacts/[id]
// Renames a contact, changes their language or email, or puts them first.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  bindLocaleFromRequest(req);
  const { id } = await params;
  const res = await discoveryRoute(
    req,
    {
      schema: updateSafetyContactSchema,
      label: "PATCH /safety/contacts/[id]",
      params: { contactId: id },
    },
    ({ svc, userId, data }) =>
      updateSafetyContactCore(svc, signedIn(userId), data),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

// DELETE /api/mobile/safety/contacts/[id]
// Removes a trusted contact.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  bindLocaleFromRequest(req);
  const { id } = await params;
  const res = await discoveryRoute(
    req,
    {
      schema: safetyContactIdSchema,
      label: "DELETE /safety/contacts/[id]",
      params: { contactId: id },
    },
    ({ svc, userId, data }) =>
      removeSafetyContactCore(svc, signedIn(userId), data.contactId),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
