import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import { acceptTeamTermsCore } from "@abonten/services/teams/teamCore";
import { acceptTeamTermsSchema } from "@abonten/validation/teamSchemas";

// POST /api/mobile/teams/:teamId/terms   Body: { termsVersion }
// An Owner accepts the published team terms for the team (N4). The team's
// money waits until one Owner has accepted the current version.
export const POST = teamRoute<{ teamId: string }>()(
  "POST /teams/:teamId/terms",
  acceptTeamTermsSchema,
  (svc, userId, input) => acceptTeamTermsCore(svc, userId, input),
);
