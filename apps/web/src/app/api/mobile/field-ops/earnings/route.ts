import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import { getMyEarningsCore } from "@abonten/services/fieldOps/member/earningsQuery";
import { bindLocaleFromRequest } from "@abonten/services/i18n/requestLocale";
import { fieldOpsEarningsSchema } from "@abonten/validation/fieldOpsSchemas";

// GET /api/mobile/field-ops/earnings?campaignId= -- the caller's own
// commission lines and totals. Same service as getMyFieldOpsEarnings.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  return fieldOpsRoute(
    req,
    { schema: fieldOpsEarningsSchema, label: "GET /field-ops/earnings" },
    (svc, userId, data) => getMyEarningsCore(svc, userId, data),
  );
}
