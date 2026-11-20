"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { saveSeatingPlanCore } from "@abonten/services/seating/seatingCore";
import {
  type SaveSeatingPlanInput,
  saveSeatingPlanSchema,
} from "@abonten/validation/seatingSchemas";

/**
 * Creates or changes one of the organizer's seating plans (a venue's
 * sections and rows; docs/architecture/assigned-seats.md).
 */
export default withActionLocale(async function saveSeatingPlan(
  input: SaveSeatingPlanInput,
) {
  const parsed = saveSeatingPlanSchema.safeParse(input);
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
  return saveSeatingPlanCore(actor.accountId, {
    planId: parsed.data.planId ?? null,
    name: parsed.data.name,
    sections: parsed.data.sections.map((s) => ({
      id: s.id ?? null,
      name: s.name,
      rows: s.rows,
    })),
  });
});
