import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import { getLeadPerformanceCore } from "@abonten/services/fieldOps/lead/performanceQuery";
import { fieldOpsCampaignIdSchema } from "@abonten/validation/fieldOpsSchemas";

// GET /api/mobile/field-ops/lead/performance?campaignId= -- the lead's team
// and territory figures. Same service as getFieldOpsLeadPerformance.
export async function GET(req: Request) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsCampaignIdSchema,
      label: "GET /field-ops/lead/performance",
    },
    (svc, userId, data) => getLeadPerformanceCore(svc, userId, data),
  );
}
