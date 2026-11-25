import { bearerFrom } from "@/app/api/mobile/_lib/authedClient";
import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import { requestTeamDeletionCore } from "@abonten/services/teams/teamDeletionCore";
import { signedInAt } from "@abonten/services/teams/teamMoney";
import { requestTeamDeletionSchema } from "@abonten/validation/teamSchemas";

// POST /api/mobile/teams/:teamId/deletion   { confirmName }
// An Owner asks to delete the team: the team's name typed to confirm and a
// sign-in in the last 15 minutes. With one Owner it is deleted now
// (data.state "deleted"); otherwise every other Owner is asked
// ("requested"). Same service as the website's requestTeamDeletion.
export const POST = teamRoute<{ teamId: string }>()(
  "POST /teams/:teamId/deletion",
  requestTeamDeletionSchema,
  async (svc, userId, input, { req, supabase }) =>
    requestTeamDeletionCore(svc, userId, input, {
      signedInAt: await signedInAt(supabase, bearerFrom(req) ?? undefined),
    }),
);
