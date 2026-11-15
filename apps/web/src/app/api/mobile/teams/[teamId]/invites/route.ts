import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import { canTextNumber } from "@abonten/services/safety/safetyPeople";
import { inviteTeamMemberCore } from "@abonten/services/teams/teamCore";
import { inviteTeamMemberSchema } from "@abonten/validation/teamSchemas";

// POST /api/mobile/teams/:teamId/invites   { role, target }
// An Owner invites someone, by username or phone number, in a role.
export const POST = teamRoute<{ teamId: string }>()(
  "POST /teams/:teamId/invites",
  inviteTeamMemberSchema,
  (svc, userId, input) =>
    inviteTeamMemberCore(svc, userId, input, { canTextNumber }),
);
