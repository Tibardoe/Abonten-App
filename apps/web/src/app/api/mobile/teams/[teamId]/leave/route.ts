import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import { leaveTeamCore } from "@abonten/services/teams/teamCore";
import { teamIdSchema } from "@abonten/validation/teamSchemas";

// POST /api/mobile/teams/:teamId/leave
// The person leaves the team. The last Owner names another Owner first.
export const POST = teamRoute<{ teamId: string }>()(
  "POST /teams/:teamId/leave",
  teamIdSchema,
  (svc, userId, input) => leaveTeamCore(svc, userId, input.teamId),
  { body: false },
);
