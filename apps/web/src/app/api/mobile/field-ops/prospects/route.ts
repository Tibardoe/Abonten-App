import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import { createProspectCore } from "@abonten/services/fieldOps/member/prospectsCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { fieldOpsProspectCreateSchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/prospects -- log a business found in an assigned
// territory. Same service as createFieldOpsProspect.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsProspectCreateSchema,
      label: "POST /field-ops/prospects",
    },
    (svc, userId, data) => createProspectCore(svc, userId, data),
  );
}
