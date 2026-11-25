import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import { teamPhotoUploadSignatureCore } from "@abonten/services/teams/teamProfileCore";
import { teamIdSchema } from "@abonten/validation/teamSchemas";

// POST /api/mobile/teams/:teamId/photo/signature
// A short-lived Cloudinary signature for the team's photo, scoped to the
// team's own folder (user_profiles/<team>), for an Owner. Same service as
// the website's getTeamPhotoUploadSignature action.
export const POST = teamRoute<{ teamId: string }>()(
  "POST /teams/:teamId/photo/signature",
  teamIdSchema,
  (svc, userId, input) =>
    teamPhotoUploadSignatureCore(svc, userId, input.teamId),
  { body: false },
);
