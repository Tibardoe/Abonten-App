"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { moveEventToTeamCore } from "@abonten/services/teams/teamCore";
import { moveEventToTeamSchema } from "@abonten/validation/teamSchemas";

/**
 * An Owner moves one of their own events (its whole run) into the team,
 * while nobody has bought or registered. Always the person's own events:
 * never resolved through "Managing as". Same service as POST
 * /api/mobile/organizer/events/:eventId/move-to-team.
 */
export const moveEventToTeam = withActionLocale(async function moveEventToTeam(
  raw: unknown,
) {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  const parsed = parseDiscoveryInput(moveEventToTeamSchema, raw);
  if (parsed.error) return parsed.error;
  const result = await moveEventToTeamCore(
    caller.svc,
    caller.userId,
    parsed.data,
  );
  if (result.status === 200) {
    revalidateAppPath("/manage/events");
    revalidateAppPath(`/manage/events/${parsed.data.eventId}`);
  }
  return result;
});
