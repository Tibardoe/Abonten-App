import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import { listMyAssignmentsCore } from "@abonten/services/fieldOps/member/assignmentsCore";
import { fieldOpsAssignmentListSchema } from "@abonten/validation/fieldOpsSchemas";

// GET /api/mobile/field-ops/assignments?campaignId=&status= -- the caller's own
// assignments. Same service as listMyFieldOpsAssignments.
export async function GET(req: Request) {
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsAssignmentListSchema,
      label: "GET /field-ops/assignments",
    },
    (svc, userId, data) =>
      listMyAssignmentsCore(svc, userId, {
        campaignId: data.campaignId,
        status: data.status,
      }),
  );
}
