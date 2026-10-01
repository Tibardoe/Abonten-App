"use server";

import TicketPurchaseEmailTemplate, {
  type EmailTicketLine,
} from "@/components/organisms/TicketPurchaseEmailTemplate";
import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { emailWords } from "@/lib/email/emailWords";
import { emailIsConfigured, sendEmail } from "@/lib/email/sendEmail";
import { generateTicketPdfBuffer } from "@/utils/generateTicketPdfBuffer";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { formatMoney } from "@abonten/core/formatMoney";
import { logger } from "@abonten/core/logger";
import {
  buildTicketPdfData,
  buildTicketPdfFilename,
} from "@abonten/core/ticketPdfData";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import { coreTFor, tr } from "@abonten/services/i18n/requestLocale";
import { userLocaleRaw } from "@abonten/services/i18n/userLocale";
import type { AuthOverride } from "@abonten/types/authOverrideType";
import { getLocale } from "next-intl/server";
import React from "react";
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
export default withActionLocale(async function ticketPurchaseNotification(
  ticketIds: string[],
  orderAmount?: number | null,
  authOverride?: AuthOverride,
) {
  try {
    if (!emailIsConfigured()) {
      logger.warn("RESEND_API_KEY is not set; skipping ticket purchase email");
      return {
        status: 500,
        message: tr("emailServiceNotConfigured"),
      };
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
          logger.error(
            `Failed resolving user email: ${adminUserError?.message}`,
          );
          return {
            status: 500,
            message: tr("couldNotResolveUserEmail"),
          };
        }
        email = adminUser.user.email ?? "";
      }
    } else {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!user || userError) {
        logger.error(`Error fetching user: ${userError?.message}`);
        return { status: 401, message: tr("userNotLoggedIn3") };
      }

      userId = user.id;
      email = user.email ?? "";
    }

    const ticketsResponse = await getTicketsByIds(ticketIds, authOverride);

    if (ticketsResponse.status !== 200 || ticketsResponse.data.length === 0) {
      logger.error(
        `Could not load tickets for purchase email: ${ticketsResponse.message}`,
      );
      return { status: 404, message: tr("ticketsNotFound") };
    }

    const tickets = ticketsResponse.data;

    const { data: userInfo, error: infoError } = await supabase
      .from("user_info")
      .select("username, full_name")
      .eq("id", userId)
      .single();

    if (infoError) {
      logger.error(`Error fetching user info: ${infoError.message}`);
      return { status: 500, message: tr("errorFetchingUserInfo") };
    }

    const username = userInfo?.username ?? null;
    const attendeeName = userInfo?.full_name ?? username;
    // The buyer's language: the one saved on their account, else the one
    // they are buying in. The webhook path has no request language.
    const saved = await userLocaleRaw(userId);
    let locale: string | null = saved;
    if (!locale) {
      try {
        locale = await getLocale();
      } catch {
        locale = "en";
      }
    }
    const words = emailWords(locale, username);

    const ticketPdfDatas = tickets.map((ticket) =>
      buildTicketPdfData(ticket, attendeeName, locale),
    );

    const pdfBuffers = await Promise.all(
      ticketPdfDatas.map(async (pdfData) => ({
        filename: buildTicketPdfFilename(pdfData.ticketCode),
        content: await generateTicketPdfBuffer(pdfData, locale),
      })),
    );

    const firstTicket = tickets[0];
    const firstPdfData = ticketPdfDatas[0];
    const currency = firstTicket.ticket_type.currency;
    const amountLabel =
      orderAmount && orderAmount > 0
        ? formatMoney(currency, orderAmount, { locale })
        : words.t("ticket.free");

    const ticketLines: EmailTicketLine[] = tickets.map((ticket) => ({
      ticketCode: ticket.ticket_code,
      ticketTypeName: ticketTypeLabel(
        coreTFor(locale),
        ticket.ticket_type.type,
      ),
    }));

    const { data, error } = await sendEmail({
      from: "Abonten Hub <tickets@abontenhub.com>",
      to: [email],
      subject: words.t("ticket.subject", {
        eventTitle: firstTicket.event.title,
      }),
      react: TicketPurchaseEmailTemplate({
        words,
        eventTitle: firstTicket.event.title,
        eventDate: firstPdfData.eventDate,
        eventTime: firstPdfData.eventTime,
        eventAddress: firstPdfData.eventAddress,
        tickets: ticketLines,
        purchaseDate: formatDateWithSuffix(
          firstTicket.issued_at,
          undefined,
          locale,
        ),
        amountLabel,
        myEventsUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/manage/my-events`,
      }),
      attachments: pdfBuffers,
    });

    if (error) {
      logger.error(`Failed sending ticket purchase email: ${error.message}`);
      return { status: 400, message: error.message };
    }

    return { status: 200, data };
  } catch (error) {
    logger.error(`Unexpected error sending ticket purchase email: ${error}`);
    return {
      status: 500,
      message: tr("somethingWentWrongSendingTheEmail"),
    };
  }
});
