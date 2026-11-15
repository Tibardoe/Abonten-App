import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import {
  createTeamCore,
  getTeamsOverviewCore,
} from "@abonten/services/teams/teamCore";
import {
  createTeamSchema,
  noInputSchema,
} from "@abonten/validation/teamSchemas";

// GET /api/mobile/teams
// The teams the person runs, the invitations waiting for them, and whether
// they may make one.
export const GET = teamRoute<Record<string, never>>()(
  "GET /teams",
  noInputSchema,
  (svc, userId) => getTeamsOverviewCore(svc, userId),
  { body: false },
);

// POST /api/mobile/teams   { name, username }
// Makes a team run by the person as its first Owner.
export const POST = teamRoute<Record<string, never>>()(
  "POST /teams",
  createTeamSchema,
  (svc, userId, input) => createTeamCore(svc, userId, input),
);
