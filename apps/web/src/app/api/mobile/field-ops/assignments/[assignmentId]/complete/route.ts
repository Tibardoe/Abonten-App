import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { completeAssignmentCore } from "@abonten/services/fieldOps/member/assignmentsCore";
import { fieldOpsAssignmentCompleteSchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/assignments/:assignmentId/complete { campaignId }
// Same service as completeFieldOpsAssignment.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const { assignmentId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsAssignmentCompleteSchema,
      params: { assignmentId },
      label: "POST /field-ops/assignments/[assignmentId]/complete",
    },
    (svc, userId, data) => completeAssignmentCore(svc, userId, data),
  );
}
