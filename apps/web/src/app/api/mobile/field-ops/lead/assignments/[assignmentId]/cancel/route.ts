import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { cancelAssignmentCore } from "@abonten/services/fieldOps/lead/leadAssignmentsCore";
import { fieldOpsAssignmentCancelSchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/lead/assignments/:assignmentId/cancel
// { campaignId, reason }. Same service as cancelFieldOpsAssignment.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const { assignmentId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsAssignmentCancelSchema,
      params: { assignmentId },
      label: "POST /field-ops/lead/assignments/[assignmentId]/cancel",
    },
    (svc, userId, data) => cancelAssignmentCore(svc, userId, data),
  );
}
