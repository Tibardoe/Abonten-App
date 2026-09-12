import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import {
  getMyContentCore,
  submitContentCore,
} from "@abonten/services/fieldOps/member/contentCore";
import {
  fieldOpsContentListSchema,
  fieldOpsContentSubmitSchema,
} from "@abonten/validation/fieldOpsSchemas";

// GET /api/mobile/field-ops/content?campaignId= -- the campaign's briefs and
// the caller's own deliverables. Same service as getMyFieldOpsContent.
export async function GET(req: Request) {
  return fieldOpsRoute(
    req,
    { schema: fieldOpsContentListSchema, label: "GET /field-ops/content" },
    (svc, userId, data) => getMyContentCore(svc, userId, data),
  );
}

// POST /api/mobile/field-ops/content -- send in a posted deliverable. Same
// service as submitFieldOpsContent.
export async function POST(req: Request) {
  return fieldOpsRoute(
    req,
    { schema: fieldOpsContentSubmitSchema, label: "POST /field-ops/content" },
    (svc, userId, data) => submitContentCore(svc, userId, data),
  );
}
