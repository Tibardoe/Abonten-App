import { teamRoute } from "@/app/api/mobile/_lib/teamRoute";
import { updateTeamProfileCore } from "@abonten/services/teams/teamProfileCore";
import { updateTeamProfileSchema } from "@abonten/validation/teamSchemas";

// PATCH /api/mobile/teams/:teamId/profile
// { username?, bio?, website?, socialLinks? }
// An Owner changes the team's profile (only the fields sent). Same service
// as the website's updateTeamProfile action. A taken username is a 409.
export const PATCH = teamRoute<{ teamId: string }>()(
  "PATCH /teams/:teamId/profile",
  updateTeamProfileSchema,
  (svc, userId, input) => updateTeamProfileCore(svc, userId, input),
);
