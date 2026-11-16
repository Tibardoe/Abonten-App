import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import { convertAccountToTeamCore } from "@abonten/services/teams/teamCore";
import { convertAccountToTeamSchema } from "@abonten/validation/teamSchemas";

// POST /api/mobile/teams/convert   { name }
// "Make this a team": the person's events, places, followers and organizer
// money move to a new team that takes their handle; they become its Owner.
export const POST = teamRoute<Record<string, never>>()(
  "POST /teams/convert",
  convertAccountToTeamSchema,
  (svc, userId, input) => convertAccountToTeamCore(svc, userId, input),
);
