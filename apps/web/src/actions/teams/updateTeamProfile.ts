"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { updateTeamProfileCore } from "@abonten/services/teams/teamProfileCore";
import { updateTeamProfileSchema } from "@abonten/validation/teamSchemas";

/**
 * An Owner changes the team's username, bio, website or social links. Same
 * service as PATCH /api/mobile/teams/:teamId/profile.
 */
export const updateTeamProfile = withActionLocale(
  async function updateTeamProfile(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(updateTeamProfileSchema, raw);
    if (input.error) return input.error;
    const result = await updateTeamProfileCore(
      caller.svc,
      caller.userId,
      input.data,
    );
    if (result.status === 200) {
      revalidateAppPath(`/settings/teams/${input.data.teamId}`);
    }
    return result;
  },
);
