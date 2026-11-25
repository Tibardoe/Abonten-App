import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import { saveTeamPhotoCore } from "@abonten/services/teams/teamProfileCore";
import { teamPhotoSchema } from "@abonten/validation/teamSchemas";

// PUT /api/mobile/teams/:teamId/photo   { publicId, version, transformation? }
// Saves the photo an Owner uploaded with the team's signature (it must sit
// in the team's folder). Same service as the website's saveTeamPhoto.
export const PUT = teamRoute<{ teamId: string }>()(
  "PUT /teams/:teamId/photo",
  teamPhotoSchema,
  (svc, userId, input) => saveTeamPhotoCore(svc, userId, input),
);
