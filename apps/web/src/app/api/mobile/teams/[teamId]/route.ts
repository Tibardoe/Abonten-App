import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import { getTeamCore, renameTeamCore } from "@abonten/services/teams/teamCore";
import {
  renameTeamSchema,
  teamIdSchema,
} from "@abonten/validation/teamSchemas";

// GET /api/mobile/teams/:teamId
// One team as its member sees it; Owners also get invitations and activity.
export const GET = teamRoute<{ teamId: string }>()(
  "GET /teams/:teamId",
  teamIdSchema,
  (svc, userId, input) => getTeamCore(svc, userId, input.teamId),
  { body: false },
);

// PATCH /api/mobile/teams/:teamId   { name }
// An Owner renames the team.
export const PATCH = teamRoute<{ teamId: string }>()(
  "PATCH /teams/:teamId",
  renameTeamSchema,
  (svc, userId, input) => renameTeamCore(svc, userId, input),
);
