"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { actingFor } from "@/utils/teamActor";
import {
  type AddEventShowsResult,
  addEventShowsCore,
} from "@abonten/services/events/eventShowsCore";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type AddEventShowsSchemaInput,
  addEventShowsSchema,
} from "@abonten/validation/showRunSchemas";

/**
 * Adds shows to a listing's run (a weekly pattern or dates), or makes a
 * separate copy of it with one new date. Thin wrapper over
 * addEventShowsCore, shared with POST /api/mobile/organizer/events/:id/shows
 * (docs/architecture/show-runs.md).
 */
export default withActionLocale(async function addEventShows(
  input: AddEventShowsSchemaInput,
): Promise<AddEventShowsResult | { status: 400 | 401 | 403; message: string }> {
  const parsed = addEventShowsSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, message: tr("invalidRequestBody") };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { status: 401, message: tr("userNotAuthenticated") };
  }

  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await actingFor(user.id, "events.manage");
  if (actor.error) return actor.error;

  const result = await addEventShowsCore(supabase, actor.accountId, {
    eventId: parsed.data.eventId,
    rule: parsed.data.rule
      ? {
          ...parsed.data.rule,
          slots: parsed.data.rule.slots.map((s) => ({
            weekday: s.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
            time: s.time,
          })),
        }
      : null,
    shows: parsed.data.shows ?? null,
    separate: parsed.data.separate,
    venue: parsed.data.venue ?? null,
    clientRequestId: parsed.data.clientRequestId,
  });
  if (result.status === 200) {
    revalidateAppPath("/manage/events");
  }
  return result;
});
