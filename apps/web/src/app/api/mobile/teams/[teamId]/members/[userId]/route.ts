import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import {
  removeTeamMemberCore,
  setTeamMemberRoleCore,
} from "@abonten/services/teams/teamCore";
import {
  teamMemberRoleSchema,
  teamMemberSchema,
} from "@abonten/validation/teamSchemas";

// PATCH /api/mobile/teams/:teamId/members/:userId   { role }
// An Owner gives a member another role.
export const PATCH = teamRoute<{ teamId: string; userId: string }>()(
  "PATCH /teams/:teamId/members/:userId",
  teamMemberRoleSchema,
  (svc, userId, input) => setTeamMemberRoleCore(svc, userId, input),
);

// DELETE /api/mobile/teams/:teamId/members/:userId
// An Owner removes a member; their access ends at once.
export const DELETE = teamRoute<{ teamId: string; userId: string }>()(
  "DELETE /teams/:teamId/members/:userId",
  teamMemberSchema,
  (svc, userId, input) => removeTeamMemberCore(svc, userId, input),
  { body: false },
);
