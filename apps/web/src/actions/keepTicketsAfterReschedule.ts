"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import {
  type RescheduleChoiceResult,
  keepTicketsAfterRescheduleCore,
} from "@abonten/services/events/eventRescheduleCore";
import { tr } from "@abonten/services/i18n/requestLocale";
import { rescheduleEventIdSchema } from "@abonten/validation/rescheduleSchemas";

/**
 * "Keep my tickets" after an event moved. Shared with
 * POST /api/mobile/events/:eventId/reschedule/keep.
 */
export default withActionLocale(async function keepTicketsAfterReschedule(
  eventId: string,
): Promise<RescheduleChoiceResult> {
  const parsed = rescheduleEventIdSchema.safeParse({ eventId });
  if (!parsed.success) {
    return { status: 400, message: tr("invalidRequestBody") };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: tr("userNotAuthenticated") };
  return keepTicketsAfterRescheduleCore(supabase, user.id, parsed.data.eventId);
});
