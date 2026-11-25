import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import { cancelTeamDeletionCore } from "@abonten/services/teams/teamDeletionCore";
import { teamDeletionRequestSchema } from "@abonten/validation/teamSchemas";

// DELETE /api/mobile/teams/:teamId/deletion/:requestId
// Any Owner stops a request to delete the team; the other Owners are told.
// Same service as the website's cancelTeamDeletion.
export const DELETE = teamRoute<{ teamId: string; requestId: string }>()(
  "DELETE /teams/:teamId/deletion/:requestId",
  teamDeletionRequestSchema,
  (svc, userId, input) => cancelTeamDeletionCore(svc, userId, input),
  { body: false },
);
