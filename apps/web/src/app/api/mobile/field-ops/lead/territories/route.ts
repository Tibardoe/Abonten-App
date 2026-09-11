import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import {
  listLeadTerritoriesCore,
  upsertLeadTerritoryCore,
} from "@abonten/services/fieldOps/lead/leadTerritoriesCore";
import {
  fieldOpsCampaignIdSchema,
  fieldOpsLeadTerritorySchema,
} from "@abonten/validation/fieldOpsSchemas";

// GET /api/mobile/field-ops/lead/territories?campaignId= -- every territory in
// the campaign's region. Same service as listFieldOpsLeadTerritories.
export async function GET(req: Request) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsCampaignIdSchema,
      label: "GET /field-ops/lead/territories",
    },
    (svc, userId, data) =>
      listLeadTerritoriesCore(svc, userId, data.campaignId),
  );
}

// POST /api/mobile/field-ops/lead/territories -- add (no id) or edit (id) a
// town/area. Same service as upsertFieldOpsLeadTerritory.
export async function POST(req: Request) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsLeadTerritorySchema,
      label: "POST /field-ops/lead/territories",
    },
    (svc, userId, data) => upsertLeadTerritoryCore(svc, userId, data),
  );
}
