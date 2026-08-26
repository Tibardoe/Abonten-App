"use server";

import EventCancellationEmailTemplate from "@/components/organisms/EventCancellationEmailTemplate";
import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import { Resend } from "resend";

export type CancelledAttendeeRefund = {
  userId: string;
  amount: number;
  currency: string;
};

/**
 * Fire-and-forget cancellation emails for PAID ticket holders of a
 * just-cancelled event — called via after() from cancelEvent.ts, mirroring
 * ticketPurchaseNotification.ts's non-blocking pattern (a failure here never
 * rolls back or blocks the cancellation, which has already committed).
 *
 * Free registrations don't get an email — the in-app notification already
 * covers them and there's no refund to explain.
 *
 * Uses the service-role client (not a cookie session) because it needs to
 * resolve OTHER users' emails via the Admin API. This is safe: the caller
 * (cancelEvent.ts) has already independently verified the organizer's
 * identity and event ownership via cancel_event_and_release_tickets before
 * this ever runs — the same "identity already proven before using this
 * client" precedent serviceClient.ts documents for its other callers.
 */
export default async function eventCancellationNotification(
  eventTitle: string,
  attendees: CancelledAttendeeRefund[],
) {
  if (!process.env.RESEND_API_KEY) {
    console.log(
      "RESEND_API_KEY is not set; skipping event cancellation emails",
    );
    return { status: 500, message: "Email service not configured" };
  }

  if (attendees.length === 0) {
    return { status: 200, data: { sent: 0, failed: 0 } };
  }

  const supabase = getSupabaseServiceClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  let sent = 0;
  let failed = 0;

  await Promise.all(
    attendees.map(async (attendee) => {
      try {
        const { data: adminUser, error: adminUserError } =
          await supabase.auth.admin.getUserById(attendee.userId);

        if (adminUserError || !adminUser.user?.email) {
          console.log(
            `Could not resolve email for user ${attendee.userId}: ${adminUserError?.message}`,
          );
          failed += 1;
          return;
        }

        const { data: userInfo } = await supabase
          .from("user_info")
          .select("username, full_name")
          .eq("id", attendee.userId)
          .maybeSingle();

        const username = userInfo?.full_name ?? userInfo?.username ?? null;

        const { error } = await resend.emails.send({
          from: "Abonten Hub <tickets@abontenhub.com>",
          to: [adminUser.user.email],
          subject: `Event cancelled — ${eventTitle}`,
          react: EventCancellationEmailTemplate({
            username,
            eventTitle,
            amountLabel: attendee.amount.toFixed(2),
            currency: attendee.currency,
            myTicketsUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/manage/my-events?tab=refunds`,
          }),
        });

        if (error) {
          console.log(`Failed sending cancellation email: ${error.message}`);
          failed += 1;
        } else {
          sent += 1;
        }
      } catch (error) {
        console.log(`Unexpected error sending cancellation email: ${error}`);
        failed += 1;
      }
    }),
  );

  return { status: 200, data: { sent, failed } };
}
