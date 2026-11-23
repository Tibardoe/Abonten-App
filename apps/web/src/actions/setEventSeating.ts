"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { setEventSeatingCore } from "@abonten/services/seating/seatingCore";
import {
  type SetEventSeatingInput,
  setEventSeatingSchema,
} from "@abonten/validation/seatingSchemas";

/**
 * Gives an event a seating plan (or none) and each ticket type a section
 * (docs/architecture/assigned-seats.md), until a seat has been given; the
 * tickets already sold for the seated types get their seats on saving.
 */
export default withActionLocale(async function setEventSeating(
  input: SetEventSeatingInput,
) {
  const parsed = setEventSeatingSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 400 as const, message: tr("invalidRequestBody") };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { status: 401 as const, message: tr("userNotAuthenticated") };
  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await actingFor(user.id, "events.manage");
  if (actor.error) return actor.error;
  return setEventSeatingCore(supabase, actor.accountId, parsed.data);
});
