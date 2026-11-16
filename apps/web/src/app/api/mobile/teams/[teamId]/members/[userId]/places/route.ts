import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import { setTeamMemberPlacesCore } from "@abonten/services/teams/teamCore";
import { teamMemberPlacesSchema } from "@abonten/validation/teamSchemas";

// PUT /api/mobile/teams/:teamId/members/:userId/places   { placeIds }
// An Owner limits a Front desk or Door staff member to some of the team's
// places (a chain); an empty list lifts the limit.
export const PUT = teamRoute<{ teamId: string; userId: string }>()(
  "PUT /teams/:teamId/members/:userId/places",
  teamMemberPlacesSchema,
  (svc, userId, input) => setTeamMemberPlacesCore(svc, userId, input),
);
