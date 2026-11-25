import { bearerFrom } from "@/app/api/mobile/_lib/authedClient";
import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import { approveTeamDeletionCore } from "@abonten/services/teams/teamDeletionCore";
import { signedInAt } from "@abonten/services/teams/teamMoney";
import { teamDeletionRequestSchema } from "@abonten/validation/teamSchemas";

// POST /api/mobile/teams/:teamId/deletion/:requestId/approve
// Another Owner approves deleting the team (a sign-in in the last 15
// minutes). The last approval deletes it (data.state "deleted"). Same
// service as the website's approveTeamDeletion.
export const POST = teamRoute<{ teamId: string; requestId: string }>()(
  "POST /teams/:teamId/deletion/:requestId/approve",
  teamDeletionRequestSchema,
  async (svc, userId, input, { req, supabase }) =>
    approveTeamDeletionCore(svc, userId, input, {
      signedInAt: await signedInAt(supabase, bearerFrom(req) ?? undefined),
    }),
  { body: false },
);
