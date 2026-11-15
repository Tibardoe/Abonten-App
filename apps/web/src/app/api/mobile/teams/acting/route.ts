import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import { getActingTeamsCore } from "@abonten/services/teams/actingAccount";
import { noInputSchema } from "@abonten/validation/teamSchemas";

// GET /api/mobile/teams/acting
// The teams the person may manage as (the organizer screens' "Managing as"
// choice). The app then names the chosen team in the x-abonten-team header;
// the server re-checks the membership and the role on every request.
export const GET = teamRoute<Record<string, never>>()(
  "GET /teams/acting",
  noInputSchema,
  (svc, userId) => getActingTeamsCore(svc, userId),
  { body: false },
);
