"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import {
  type HolderRescheduleResult,
  getEventRescheduleForHolderCore,
} from "@abonten/services/events/eventRescheduleCore";
import { tr } from "@abonten/services/i18n/requestLocale";
import { rescheduleEventIdSchema } from "@abonten/validation/rescheduleSchemas";

/**
 * The latest move of an event as the signed-in holder sees it: old and new
 * dates, the organizer's message, the refund window and what giving the
 * tickets back returns. Shared with GET /api/mobile/events/:eventId/reschedule.
 */
export default withActionLocale(async function getEventReschedule(
  eventId: string,
): Promise<HolderRescheduleResult | { status: 400 | 401; message: string }> {
  const parsed = rescheduleEventIdSchema.safeParse({ eventId });
  if (!parsed.success) {
    return { status: 400, message: tr("invalidRequestBody") };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: tr("userNotAuthenticated") };
  return getEventRescheduleForHolderCore(
    supabase,
    user.id,
    parsed.data.eventId,
  );
});
