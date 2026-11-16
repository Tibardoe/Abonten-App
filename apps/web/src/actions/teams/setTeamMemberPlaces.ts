"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { setTeamMemberPlacesCore } from "@abonten/services/teams/teamCore";
import { teamMemberPlacesSchema } from "@abonten/validation/teamSchemas";

/**
 * An Owner limits a Front desk or Door staff member to some of the team's
 * places (a chain); an empty list lifts the limit. Same service as
 * PUT /api/mobile/teams/:teamId/members/:userId/places.
 */
export const setTeamMemberPlaces = withActionLocale(
  async function setTeamMemberPlaces(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(teamMemberPlacesSchema, raw);
    if (input.error) return input.error;
    const result = await setTeamMemberPlacesCore(
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
