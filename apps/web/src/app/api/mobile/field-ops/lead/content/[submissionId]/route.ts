import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { reviewContentCore } from "@abonten/services/fieldOps/lead/contentLeadCore";
import { fieldOpsContentReviewSchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/lead/content/[submissionId] -- approve or reject
// a deliverable. Same service as reviewFieldOpsContent.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ submissionId: string }> },
) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsContentReviewSchema,
      params: await routeParams(ctx.params),
      label: "POST /field-ops/lead/content/[id]",
    },
    (svc, userId, data) => reviewContentCore(svc, userId, data),
  );
}
