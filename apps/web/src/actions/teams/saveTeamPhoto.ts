"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { saveTeamPhotoCore } from "@abonten/services/teams/teamProfileCore";
import { teamPhotoSchema } from "@abonten/validation/teamSchemas";

/**
 * Saves the photo an Owner uploaded to the team's folder. Same service as
 * PUT /api/mobile/teams/:teamId/photo.
 */
export const saveTeamPhoto = withActionLocale(async function saveTeamPhoto(
  raw: unknown,
) {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  const input = parseDiscoveryInput(teamPhotoSchema, raw);
  if (input.error) return input.error;
  const result = await saveTeamPhotoCore(caller.svc, caller.userId, input.data);
  if (result.status === 200) {
    revalidateAppPath(`/settings/teams/${input.data.teamId}`);
  }
  return result;
});
