"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { getMoveEventToTeamOptionsCore } from "@abonten/services/teams/teamCore";
import { moveEventToTeamOptionsSchema } from "@abonten/validation/teamSchemas";

/**
 * What "Move to a team" can offer for one of the person's own events: the
 * teams they own, how many listings would move and whether sales keep it
 * where it is. Same service as GET
 * /api/mobile/organizer/events/:eventId/move-to-team.
 */
export const getMoveEventToTeamOptions = withActionLocale(
  async function getMoveEventToTeamOptions(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const parsed = parseDiscoveryInput(moveEventToTeamOptionsSchema, raw);
    if (parsed.error) return parsed.error;
    return getMoveEventToTeamOptionsCore(
      caller.svc,
      caller.userId,
      parsed.data.eventId,
    );
  },
);
