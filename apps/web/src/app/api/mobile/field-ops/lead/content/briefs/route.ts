import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import { upsertContentBriefCore } from "@abonten/services/fieldOps/lead/contentLeadCore";
import { fieldOpsContentBriefSchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/lead/content/briefs -- write or edit a brief.
// Same service as upsertFieldOpsContentBrief.
export async function POST(req: Request) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsContentBriefSchema,
      label: "POST /field-ops/lead/content/briefs",
    },
    (svc, userId, data) => upsertContentBriefCore(svc, userId, data),
  );
}
