import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import {
  createAssignmentCore,
  listLeadAssignmentsCore,
} from "@abonten/services/fieldOps/lead/leadAssignmentsCore";
import {
  fieldOpsAssignmentCreateSchema,
  fieldOpsAssignmentListSchema,
} from "@abonten/validation/fieldOpsSchemas";

// GET /api/mobile/field-ops/lead/assignments?campaignId=&date=&status=
// Same service as listFieldOpsLeadAssignments.
export async function GET(req: Request) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsAssignmentListSchema,
      label: "GET /field-ops/lead/assignments",
    },
    (svc, userId, data) => listLeadAssignmentsCore(svc, userId, data),
  );
}

// POST /api/mobile/field-ops/lead/assignments -- assign a member to a
// territory for a date range. Same service as createFieldOpsAssignment.
export async function POST(req: Request) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsAssignmentCreateSchema,
      label: "POST /field-ops/lead/assignments",
    },
    (svc, userId, data) => createAssignmentCore(svc, userId, data),
  );
}
