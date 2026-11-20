"use server";

import EventRescheduledEmailTemplate from "@/components/organisms/EventRescheduledEmailTemplate";
import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import { withActionLocale } from "@/i18n/withActionLocale";
import { emailWordsFor } from "@/lib/email/emailWords";
import { emailIsConfigured, sendEmail } from "@/lib/email/sendEmail";
import { formatDateTime } from "@abonten/core/i18n/format";
import { logger } from "@abonten/core/logger";
import { rescheduleEmailBatchCore } from "@abonten/services/events/eventRescheduleCore";
import { tr } from "@abonten/services/i18n/requestLocale";

const WHEN: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * "Your event has moved" emails to every holder of a just-moved event —
 * called via after() from rescheduleEvent.ts and the mobile route, like
 * eventCancellationNotification.ts (a failure here never undoes the move,
 * which has committed; the in-app notice and its push are already out).
 * Each email is in its reader's language, dates on the event's clock.
 * Service role: other people's addresses come from the Admin API, after the
 * organizer was checked by rescheduleEventCore.
 */
export default withActionLocale(async function eventRescheduleNotification(
  rescheduleId: string,
) {
  if (!emailIsConfigured()) {
    logger.warn("RESEND_API_KEY is not set; skipping reschedule emails");
    return { status: 500, message: tr("emailServiceNotConfigured") };
  }
  const batch = await rescheduleEmailBatchCore(rescheduleId);
  if (!batch) return { status: 500, message: tr("somethingWentWrong") };

  const supabase = getSupabaseServiceClient();
  let sent = 0;
  let failed = 0;
  for (const userId of batch.userIds) {
    try {
      const { data: adminUser, error: adminUserError } =
        await supabase.auth.admin.getUserById(userId);
      if (adminUserError || !adminUser.user?.email) {
        failed += 1;
        continue;
      }
      const { data: userInfo } = await supabase
        .from("user_info")
        .select("username, full_name")
        .eq("id", userId)
        .maybeSingle();
      const words = await emailWordsFor(
        userId,
        userInfo?.full_name ?? userInfo?.username ?? null,
      );
      const when = (iso: string) =>
        formatDateTime(iso, words.locale, {
          ...WHEN,
          timeZone: batch.timezone,
        });
      const newWhen = when(batch.startsAt);
      const { error } = await sendEmail({
        from: "Abonten Hub <tickets@abontenhub.com>",
        to: [adminUser.user.email],
        subject: words.t("reschedule.subject", {
          eventTitle: batch.title,
          newWhen,
        }),
        react: EventRescheduledEmailTemplate({
          words,
          eventTitle: batch.title,
          previousWhen: when(batch.previousStartsAt),
          newWhen,
          refundUntil: when(batch.refundUntil),
          message: batch.message,
          myTicketsUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/manage/my-events`,
        }),
      });
      if (error) {
        logger.error(`Failed sending a reschedule email: ${error.message}`);
        failed += 1;
      } else {
        sent += 1;
      }
    } catch (error) {
      logger.error(`Unexpected error sending a reschedule email: ${error}`);
      failed += 1;
    }
  }
  return { status: 200, data: { sent, failed } };
});
