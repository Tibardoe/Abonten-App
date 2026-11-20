"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { actingFor } from "@/utils/teamActor";
import {
  type GiveComplimentaryResult,
  giveComplimentaryTicketsCore,
} from "@abonten/services/comps/complimentaryCore";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type GiveComplimentaryTicketsInput,
  giveComplimentaryTicketsSchema,
} from "@abonten/validation/complimentarySchemas";

/**
 * Gives free tickets of one of the event's types to a named person
 * (docs/architecture/complimentary-tickets.md). Thin wrapper over
 * giveComplimentaryTicketsCore, shared with
 * POST /api/mobile/organizer/events/:id/complimentary.
 */
export default withActionLocale(async function giveComplimentaryTickets(
  input: GiveComplimentaryTicketsInput,
): Promise<
  GiveComplimentaryResult | { status: 400 | 401 | 403; message: string }
> {
  const parsed = giveComplimentaryTicketsSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, message: tr("invalidRequestBody") };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: tr("userNotAuthenticated") };
  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await actingFor(user.id, "events.manage");
  if (actor.error) return actor.error;
  const result = await giveComplimentaryTicketsCore(
    supabase,
    actor.accountId,
    user.id,
    parsed.data,
  );
  if (result.status === 200) revalidateAppPath("/manage/events");
  return result;
});
