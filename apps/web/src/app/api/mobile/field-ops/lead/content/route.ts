import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import { listTeamContentCore } from "@abonten/services/fieldOps/lead/contentLeadCore";
import { fieldOpsCampaignIdSchema } from "@abonten/validation/fieldOpsSchemas";

// GET /api/mobile/field-ops/lead/content?campaignId= -- the team's briefs and
// deliverables. Same service as listFieldOpsTeamContent.
export async function GET(req: Request) {
  return fieldOpsRoute(
    req,
    { schema: fieldOpsCampaignIdSchema, label: "GET /field-ops/lead/content" },
    (svc, userId, data) => listTeamContentCore(svc, userId, data),
  );
}
