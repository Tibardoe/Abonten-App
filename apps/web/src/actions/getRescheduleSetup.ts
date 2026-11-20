"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import {
  type RescheduleSetupResult,
  getRescheduleSetupCore,
} from "@abonten/services/events/eventRescheduleCore";
import { tr } from "@abonten/services/i18n/requestLocale";
import { rescheduleEventIdSchema } from "@abonten/validation/rescheduleSchemas";

/**
 * What the organizer's "Move to a new date" card needs: whether the event
 * can move, how often it has, and how many people will be told. Shared with
 * GET /api/mobile/organizer/events/:eventId/reschedule.
 */
export default withActionLocale(async function getRescheduleSetup(
  eventId: string,
): Promise<
  RescheduleSetupResult | { status: 400 | 401 | 403; message: string }
> {
  const parsed = rescheduleEventIdSchema.safeParse({ eventId });
  if (!parsed.success) {
    return { status: 400, message: tr("invalidRequestBody") };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: tr("userNotAuthenticated") };
  const actor = await actingFor(user.id, "events.manage");
  if (actor.error) return actor.error;
  return getRescheduleSetupCore(supabase, actor.accountId, parsed.data.eventId);
});
