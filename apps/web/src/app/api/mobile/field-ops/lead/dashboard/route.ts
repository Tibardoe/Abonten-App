import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import { getLeadDashboardCore } from "@abonten/services/fieldOps/lead/leadDashboardQuery";
import { fieldOpsCampaignIdSchema } from "@abonten/validation/fieldOpsSchemas";

// GET /api/mobile/field-ops/lead/dashboard?campaignId= -- coverage board,
// today's assignments, team headcount. Same service as getFieldOpsLeadDashboard.
export async function GET(req: Request) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsCampaignIdSchema,
      label: "GET /field-ops/lead/dashboard",
    },
    (svc, userId, data) => getLeadDashboardCore(svc, userId, data.campaignId),
  );
}
