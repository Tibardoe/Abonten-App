"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import {
  type SetEventGroupDiscountsResult,
  setEventGroupDiscountsCore,
} from "@abonten/services/events/eventGroupDiscountsCore";
import { tr } from "@abonten/services/i18n/requestLocale";
import { setEventGroupDiscountsSchema } from "@abonten/validation/groupPricingSchemas";

/**
 * Replaces an event's automatic group prices ("10 or more tickets: 10%
 * off"); an empty list removes them. Thin wrapper over
 * setEventGroupDiscountsCore, shared with
 * PUT /api/mobile/organizer/events/:eventId/group-prices.
 */
export default withActionLocale(async function setEventGroupDiscounts(input: {
  eventId: string;
  tiers: { minTickets: number; percentOff: number }[];
}): Promise<
  SetEventGroupDiscountsResult | { status: 400 | 401 | 403; message: string }
> {
  const parsed = setEventGroupDiscountsSchema.safeParse(input);
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

  return setEventGroupDiscountsCore(supabase, actor.accountId, parsed.data);
});
