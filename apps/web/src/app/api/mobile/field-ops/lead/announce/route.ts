import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import { sendAnnouncementCore } from "@abonten/services/fieldOps/lead/announceCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { fieldOpsAnnouncementSchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/lead/announce { campaignId, title, body }
// Same service as sendFieldOpsAnnouncement.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsAnnouncementSchema,
      label: "POST /field-ops/lead/announce",
    },
    (svc, userId, data) => sendAnnouncementCore(svc, userId, data),
  );
}
