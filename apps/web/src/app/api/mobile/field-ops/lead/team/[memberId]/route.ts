import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { setLeadMemberStatusCore } from "@abonten/services/fieldOps/lead/leadTeamCore";
import { fieldOpsLeadMemberStatusSchema } from "@abonten/validation/fieldOpsSchemas";

// PATCH /api/mobile/field-ops/lead/team/:memberId { campaignId, status, reason }
// Same service as setFieldOpsLeadMemberStatus.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const { memberId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsLeadMemberStatusSchema,
      params: { memberId },
      label: "PATCH /field-ops/lead/team/[memberId]",
    },
    (svc, userId, data) => setLeadMemberStatusCore(svc, userId, data),
  );
}
