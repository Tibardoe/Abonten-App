import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import { listReviewQueueCore } from "@abonten/services/fieldOps/lead/reviewCore";
import { fieldOpsOnboardingListSchema } from "@abonten/validation/fieldOpsSchemas";

// GET /api/mobile/field-ops/lead/review?campaignId=&status= -- the lead's review
// queue. Same service as listFieldOpsReviewQueue.
export async function GET(req: Request) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsOnboardingListSchema,
      label: "GET /field-ops/lead/review",
    },
    (svc, userId, data) => listReviewQueueCore(svc, userId, data),
  );
}
