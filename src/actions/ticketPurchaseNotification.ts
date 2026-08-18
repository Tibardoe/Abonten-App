"use server";

import TicketPurchaseEmailTemplate, {
  type EmailTicketLine,
} from "@/components/organisms/TicketPurchaseEmailTemplate";
import { createClient } from "@/config/supabase/server";
import type { AuthOverride } from "@/types/authOverrideType";
import { formatDateWithSuffix } from "@/utils/dateFormatter";
import { generateTicketPdfBuffer } from "@/utils/generateTicketPdfBuffer";
import {
  buildTicketPdfData,
  buildTicketPdfFilename,
} from "@/utils/ticketPdfData";
import React from "react";
import { Resend } from "resend";
import getTicketsByIds from "./getTicketsByIds";

/**
 * Sends the purchase-confirmation email for a set of just-issued tickets,
 * with the canonical ticket PDF (the same one My Events → View Ticket →
 * Download produces) attached, one PDF per ticket. Called server-side from
 * generateTicket.ts / registerForFreeEvent.ts right after ticket rows are
 * committed — never throws, so a failure here can never roll back or be
 * mistaken for a failed ticket purchase; the ticket already exists and
 * remains accessible from My Events regardless of email outcome.
 *
 * `authOverride` lets the Paystack webhook (no cookies/session) drive this
 * exact same email flow — see src/types/authOverrideType.ts. If it doesn't
 * carry a resolved email, one is looked up via the service-role client's
 * admin API (the equivalent of what supabase.auth.getUser() would have
 * returned in the cookie-based path).
 */
export default async function ticketPurchaseNotification(
  ticketIds: string[],
  orderAmount?: number | null,
  authOverride?: AuthOverride,
) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.log("RESEND_API_KEY is not set; skipping ticket purchase email");
      return { status: 500, message: "Email service not configured" };
    }

    const supabase = authOverride?.supabase ?? (await createClient());

    let userId: string;
    let email: string;

    if (authOverride) {
      userId = authOverride.userId;
      if (authOverride.userEmail) {
        email = authOverride.userEmail;
      } else {
        const { data: adminUser, error: adminUserError } =
          await supabase.auth.admin.getUserById(authOverride.userId);
        if (adminUserError || !adminUser.user) {
          console.log(
            `Failed resolving user email: ${adminUserError?.message}`,
          );
          return { status: 500, message: "Could not resolve user email" };
        }
        email = adminUser.user.email ?? "";
      }
    } else {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!user || userError) {
        console.log(`Error fetching user: ${userError?.message}`);
        return { status: 401, message: "User not logged in!" };
      }

      userId = user.id;
      email = user.email ?? "";
    }

    const ticketsResponse = await getTicketsByIds(ticketIds, authOverride);

    if (ticketsResponse.status !== 200 || ticketsResponse.data.length === 0) {
      console.log(
        `Could not load tickets for purchase email: ${ticketsResponse.message}`,
      );
      return { status: 404, message: "Tickets not found" };
    }

    const tickets = ticketsResponse.data;

    const { data: userInfo, error: infoError } = await supabase
      .from("user_info")
      .select("username, full_name")
      .eq("id", userId)
      .single();

    if (infoError) {
      console.log(`Error fetching user info: ${infoError.message}`);
      return { status: 500, message: "Error fetching user info" };
    }

    const username = userInfo?.username ?? null;
    const attendeeName = userInfo?.full_name ?? username;

    const ticketPdfDatas = tickets.map((ticket) =>
      buildTicketPdfData(ticket, attendeeName),
    );

    const pdfBuffers = await Promise.all(
      ticketPdfDatas.map(async (pdfData) => ({
        filename: buildTicketPdfFilename(pdfData.ticketCode),
        content: await generateTicketPdfBuffer(pdfData),
      })),
    );

    const firstTicket = tickets[0];
    const firstPdfData = ticketPdfDatas[0];
    const currency = firstTicket.ticket_type.currency;
    const amountLabel =
      orderAmount && orderAmount > 0
        ? `${currency} ${orderAmount.toFixed(2)}`
        : "Free";

    const ticketLines: EmailTicketLine[] = tickets.map((ticket) => ({
      ticketCode: ticket.ticket_code,
      ticketTypeName: ticket.ticket_type.type,
    }));

    const resend = new Resend(process.env.RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      from: "Abonten Hub <tickets@abontenhub.com>",
      to: [email],
      subject: `Your Abonten Ticket Is Ready 🎟️ — ${firstTicket.event.title}`,
      react: TicketPurchaseEmailTemplate({
        username,
        eventTitle: firstTicket.event.title,
        eventDate: firstPdfData.eventDate,
        eventTime: firstPdfData.eventTime,
        eventAddress: firstPdfData.eventAddress,
        tickets: ticketLines,
        purchaseDate: formatDateWithSuffix(firstTicket.issued_at),
        amountLabel,
        myEventsUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/manage/my-events`,
      }),
      attachments: pdfBuffers,
    });

    if (error) {
      console.log(`Failed sending ticket purchase email: ${error.message}`);
      return { status: 400, message: error.message };
    }

    return { status: 200, data };
  } catch (error) {
    console.log(`Unexpected error sending ticket purchase email: ${error}`);
    return { status: 500, message: "Something went wrong sending the email" };
  }
}
