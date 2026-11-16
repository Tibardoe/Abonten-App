"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { convertAccountToTeamCore } from "@abonten/services/teams/teamCore";
import { convertAccountToTeamSchema } from "@abonten/validation/teamSchemas";

/**
 * "Make this a team": the person's events, places, followers and organizer
 * money move to a new team that takes their handle; they become its Owner.
 * Same service as POST /api/mobile/teams/convert.
 */
export const convertAccountToTeam = withActionLocale(
  async function convertAccountToTeam(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(convertAccountToTeamSchema, raw);
    if (input.error) return input.error;
    const result = await convertAccountToTeamCore(
      caller.svc,
      caller.userId,
      input.data,
    );
    if (result.status === 200) {
      revalidateAppPath("/settings/teams");
      revalidateAppPath("/manage/events");
      revalidateAppPath("/manage/places");
    }
    return result;
  },
);
