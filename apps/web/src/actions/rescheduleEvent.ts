"use server";

import eventRescheduleNotification from "@/actions/eventRescheduleNotification";
import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { actingFor } from "@/utils/teamActor";
import { logger } from "@abonten/core/logger";
import {
  type RescheduleEventResult,
  rescheduleEventCore,
} from "@abonten/services/events/eventRescheduleCore";
import { dispatchRescheduleTextsCore } from "@abonten/services/events/rescheduleTextsCore";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type RescheduleEventSchemaInput,
  rescheduleEventSchema,
} from "@abonten/validation/rescheduleSchemas";
import { after } from "next/server";

/**
 * Moves an event that already has tickets to a new date, with a message to
 * every holder (docs/architecture/event-reschedule.md). Thin wrapper over
 * rescheduleEventCore, shared with
 * POST /api/mobile/organizer/events/:eventId/reschedule. The holders' emails
 * go out after the response.
 */
export default withActionLocale(async function rescheduleEvent(
  input: RescheduleEventSchemaInput,
): Promise<
  RescheduleEventResult | { status: 400 | 401 | 403; message: string }
> {
  const parsed = rescheduleEventSchema.safeParse(input);
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

  const result = await rescheduleEventCore(
    supabase,
    actor.accountId,
    user.id,
    parsed.data,
  );
  if (result.status === 200) {
    const { rescheduleId } = result.data;
    after(async () => {
      await eventRescheduleNotification(rescheduleId).catch((error) =>
        logger.error(`Reschedule emails failed for ${rescheduleId}`, error),
      );
      // The texts queued by the move; the reschedule-texts job sends any
      // left over.
      await dispatchRescheduleTextsCore({ budgetMs: 20_000 }).catch((error) =>
        logger.error(`Reschedule texts failed for ${rescheduleId}`, error),
      );
    });
    revalidateAppPath("/manage/events");
  }
  return result;
});
