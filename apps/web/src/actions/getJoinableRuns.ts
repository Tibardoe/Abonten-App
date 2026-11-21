"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import {
  type ListJoinableRunsResult,
  listJoinableRunsCore,
} from "@abonten/services/events/eventShowsCore";
import { tr } from "@abonten/services/i18n/requestLocale";
import { joinableRunsSchema } from "@abonten/validation/showRunSchemas";

/**
 * The account's other runs (and single listings) still to come that could
 * be brought into this listing's run. Shared with GET
 * /api/mobile/organizer/events/:eventId/shows/join
 * (docs/architecture/show-runs.md §2b).
 */
export default withActionLocale(async function getJoinableRuns(
  input: unknown,
): Promise<
  ListJoinableRunsResult | { status: 400 | 401 | 403; message: string }
> {
  const parsed = joinableRunsSchema.safeParse(input);
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
  return listJoinableRunsCore(supabase, actor.accountId, parsed.data.eventId);
});
