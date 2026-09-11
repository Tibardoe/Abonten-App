import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { updateProspectCore } from "@abonten/services/fieldOps/member/prospectsCore";
import { fieldOpsProspectUpdateSchema } from "@abonten/validation/fieldOpsSchemas";

// PATCH /api/mobile/field-ops/prospects/:prospectId -- status, a contact
// attempt or contact details on the caller's own prospect. Same service as
// updateFieldOpsProspect.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ prospectId: string }> },
) {
  const { prospectId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsProspectUpdateSchema,
      params: { prospectId },
      label: "PATCH /field-ops/prospects/[prospectId]",
    },
    (svc, userId, data) => updateProspectCore(svc, userId, data),
  );
}
