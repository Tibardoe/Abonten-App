import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import { getMyFieldOpsCore } from "@abonten/services/fieldOps/member/myFieldOpsQuery";
import { z } from "zod";

// GET /api/mobile/field-ops/me -- programme switch, memberships, the current
// campaign with today's assignments. Same service as getMyFieldOps.
export async function GET(req: Request) {
  return fieldOpsRoute(
    req,
    { schema: z.object({}), label: "GET /field-ops/me" },
    (svc, userId) => getMyFieldOpsCore(svc, userId),
  );
}
