import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { setLeadTerritoryStatusCore } from "@abonten/services/fieldOps/lead/leadTerritoriesCore";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { fieldOpsLeadTerritoryStatusSchema } from "@abonten/validation/fieldOpsSchemas";

// PATCH /api/mobile/field-ops/lead/territories/:territoryId { campaignId, status }
// Same service as setFieldOpsLeadTerritoryStatus.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ territoryId: string }> },
) {
  bindLocaleFromRequest(req);
  const { territoryId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsLeadTerritoryStatusSchema,
      params: { territoryId },
      label: "PATCH /field-ops/lead/territories/[territoryId]",
    },
    (svc, userId, data) => setLeadTerritoryStatusCore(svc, userId, data),
  );
}
