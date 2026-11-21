"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { actingFor } from "@/utils/teamActor";
import {
  type JoinEventRunsResult,
  joinEventRunsCore,
} from "@abonten/services/events/eventShowsCore";
import { tr } from "@abonten/services/i18n/requestLocale";
import { joinEventRunsSchema } from "@abonten/validation/showRunSchemas";

/**
 * Brings another of the account's listings, with every show of its run,
 * into this listing's run, so buyers see one listing. Thin wrapper over
 * joinEventRunsCore, shared with POST
 * /api/mobile/organizer/events/:eventId/shows/join
 * (docs/architecture/show-runs.md §2b).
 */
export default withActionLocale(async function joinEventRuns(
  input: unknown,
): Promise<JoinEventRunsResult | { status: 400 | 401 | 403; message: string }> {
  const parsed = joinEventRunsSchema.safeParse(input);
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
  const result = await joinEventRunsCore(actor.accountId, parsed.data);
  if (result.status === 200) {
    revalidateAppPath("/manage/events");
  }
  return result;
});
