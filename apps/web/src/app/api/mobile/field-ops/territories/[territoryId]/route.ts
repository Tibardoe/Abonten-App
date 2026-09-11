import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { getTerritoryViewCore } from "@abonten/services/fieldOps/member/prospectsCore";
import { fieldOpsTerritoryLookupSchema } from "@abonten/validation/fieldOpsSchemas";

// GET /api/mobile/field-ops/territories/:territoryId?campaignId= -- the territory
// with the caller's assignments and prospects there. Same service as
// getFieldOpsTerritory.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ territoryId: string }> },
) {
  const { territoryId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsTerritoryLookupSchema,
      params: { territoryId },
      label: "GET /field-ops/territories/[territoryId]",
    },
    (svc, userId, data) => getTerritoryViewCore(svc, userId, data),
  );
}
