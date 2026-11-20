"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  type RescheduleChoiceResult,
  refundAfterRescheduleCore,
} from "@abonten/services/events/eventRescheduleCore";
import { tr } from "@abonten/services/i18n/requestLocale";
import { rescheduleEventIdSchema } from "@abonten/validation/rescheduleSchemas";

/**
 * "Get a refund" after an event moved: gives back the holder's tickets for
 * the ticket price and the service fee, whatever the event's refund policy
 * says, while the window is open. Shared with
 * POST /api/mobile/events/:eventId/reschedule/refund.
 */
export default withActionLocale(async function refundAfterReschedule(
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
  const result = await refundAfterRescheduleCore(
    supabase,
    user.id,
    parsed.data.eventId,
  );
  if (result.status === 200) revalidateAppPath("/manage/my-events");
  return result;
});
