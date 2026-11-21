import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import {
  getMoveEventToTeamOptionsCore,
  moveEventToTeamCore,
} from "@abonten/services/teams/teamCore";
import {
  moveEventToTeamOptionsSchema,
  moveEventToTeamSchema,
} from "@abonten/validation/teamSchemas";

// "Move to a team" for one of the person's own events (its whole run),
// while nobody has bought or registered (docs/architecture/team-accounts.md,
// "Move events into a team"). Always the person's own events: no
// x-abonten-team. Same services as the website's getMoveEventToTeamOptions
// and moveEventToTeam actions.

// GET /api/mobile/organizer/events/:eventId/move-to-team
//   -> { teams: { id, name, username }[], eventCount, hasSales }
export const GET = teamRoute<{ eventId: string }>()(
  "GET /organizer/events/:eventId/move-to-team",
  moveEventToTeamOptionsSchema,
  (svc, userId, input) =>
    getMoveEventToTeamOptionsCore(svc, userId, input.eventId),
  { body: false },
);

// POST /api/mobile/organizer/events/:eventId/move-to-team   { teamId }
export const POST = teamRoute<{ eventId: string }>()(
  "POST /organizer/events/:eventId/move-to-team",
  moveEventToTeamSchema,
  (svc, userId, input) => moveEventToTeamCore(svc, userId, input),
);
