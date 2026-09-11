import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { startAssignmentCore } from "@abonten/services/fieldOps/member/assignmentsCore";
import { fieldOpsAssignmentStartSchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/assignments/:assignmentId/start
// { campaignId, location?, accuracyM? } -- offline members send their GPS
// position. Same service as startFieldOpsAssignment.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const { assignmentId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsAssignmentStartSchema,
      params: { assignmentId },
      label: "POST /field-ops/assignments/[assignmentId]/start",
    },
    (svc, userId, data) => startAssignmentCore(svc, userId, data),
  );
}
