import { fieldOpsRoute } from "@/app/api/mobile/field-ops/_lib/handler";
import {
  inviteTeamMemberCore,
  listLeadTeamCore,
} from "@abonten/services/fieldOps/lead/leadTeamCore";
import {
  fieldOpsCampaignIdSchema,
  fieldOpsLeadInviteSchema,
} from "@abonten/validation/fieldOpsSchemas";

// GET /api/mobile/field-ops/lead/team?campaignId= -- the lead's team, no
// payout details. Same service as listFieldOpsLeadTeam.
export async function GET(req: Request) {
  return fieldOpsRoute(
    req,
    { schema: fieldOpsCampaignIdSchema, label: "GET /field-ops/lead/team" },
    (svc, userId, data) => listLeadTeamCore(svc, userId, data.campaignId),
  );
}

// POST /api/mobile/field-ops/lead/team -- invite a field member by phone.
// Same service as inviteFieldOpsTeamMember.
export async function POST(req: Request) {
  return fieldOpsRoute(
    req,
    { schema: fieldOpsLeadInviteSchema, label: "POST /field-ops/lead/team" },
    (svc, userId, data) => inviteTeamMemberCore(svc, userId, data),
  );
}
