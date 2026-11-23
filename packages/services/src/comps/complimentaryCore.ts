// Complimentary tickets (docs/architecture/complimentary-tickets.md): an
// organizer gives free tickets of one of the event's types to a named
// person (cast, press, sponsors, family). Shared by the web action
// giveComplimentaryTickets and
// POST /api/mobile/organizer/events/:eventId/complimentary.
//
// The tickets are real tickets on the recipient's account: counted
// against the seats and the type's stock, seated like any other, checked
// in at the door, never refundable (no payment). issue_complimentary_tickets
// writes them in one transaction as a 'paid' checkout of total 0 marked
// complimentary, so no money moves and the numbers show them apart.

import { resolveEventEndDate } from "@abonten/core/dateFormatter";
import { logger } from "@abonten/core/logger";
import { parsePhone } from "@abonten/core/phone";
import { userFacingError } from "@abonten/core/userFacingError";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";
import { createNotificationCore } from "../notifications/createNotification";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import {
  generateQRCodeDataURL,
  generateTicketCode,
} from "../tickets/generateTicketCode";
import { saveEventQrCodeToCloudinary } from "../tickets/saveEventQrCodeToCloudinary";

/** Tickets one gift may hold (people, so 20 Couple tickets at most). */
export const MAX_COMPLIMENTARY_TICKETS = 40;

export type ComplimentaryTarget =
  | { kind: "username"; username: string }
  | { kind: "phone"; phone: string };

export type GiveComplimentaryInput = {
  eventId: string;
  ticketTypeId: string;
  /** Purchases of the type (a Couple counts once and is two tickets). */
  quantity: number;
  occurrenceId?: string | null;
  target: ComplimentaryTarget;
  note?: string | null;
};

export type GiveComplimentaryResult =
  | { status: 200; message: string; data: { tickets: number } }
  | { status: 400 | 403 | 404 | 409 | 500; message: string };

async function recipientOf(
  target: ComplimentaryTarget,
  countryHint: string | null,
): Promise<{ id: string; name: string } | null> {
  const svc = getSupabaseServiceClient();
  if (target.kind === "username") {
    const handle = target.username.trim().replace(/^@/, "");
    const { data } = await svc
      .from("user_info")
      .select("id, full_name, username, status_id")
      .ilike("username", handle)
      .maybeSingle();
    if (!data || data.status_id === 4) return null;
    return { id: data.id, name: data.full_name?.trim() || data.username || "" };
  }
  const parsed = parsePhone(target.phone, countryHint ?? "GH");
  if (!parsed.ok) return null;
  const { data: owner } = await svc.rpc("ticket_transfer_user_by_phone", {
    p_phone: parsed.e164,
  });
  if (!owner) return null;
  const { data } = await svc
    .from("user_info")
    .select("id, full_name, username, status_id")
    .eq("id", owner as string)
    .maybeSingle();
  if (!data || data.status_id === 4) return null;
  return { id: data.id, name: data.full_name?.trim() || data.username || "" };
}

export async function giveComplimentaryTicketsCore(
  supabase: SupabaseClient<Database>,
  accountId: string,
  personId: string,
  input: GiveComplimentaryInput,
): Promise<GiveComplimentaryResult> {
  if (await isAccountRestricted(accountId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }

  // The caller's own client: only the organizer (or a member acting for
  // them) reads the event here.
  const { data: event, error } = await supabase
    .from("event")
    .select(
      "id, title, status, starts_at, ends_at, country_code, event_occurrence(id, starts_at, ends_at), ticket_type(id, price, admits, type, amount_mode)",
    )
    .eq("id", input.eventId)
    .eq("organizer_id", accountId)
    .maybeSingle();
  if (error) {
    logger.error(`complimentary: event read failed (${error.message})`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (!event) {
    return { status: 404, message: tr("eventNotFoundOrUnauthorized") };
  }

  const type = (event.ticket_type ?? []).find(
    (t) => t.id === input.ticketTypeId,
  );
  if (!type) {
    return {
      status: 404,
      message: tr("ticketOfTypeNotFound", { ticketTypeId: input.ticketTypeId }),
    };
  }
  // A ticket whose amount the buyer chooses (open-amount tickets) is worth
  // what was paid for it: a gift of one would have no amount to load.
  if (type.amount_mode === "open") {
    return { status: 400, message: tr("openAmountTicketsCantBeGiven") };
  }
  const admits = Math.max(1, type.admits ?? 1);
  const tickets = input.quantity * admits;
  if (
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    tickets > MAX_COMPLIMENTARY_TICKETS
  ) {
    return {
      status: 400,
      message: tr("giveFromOneToTickets", { max: MAX_COMPLIMENTARY_TICKETS }),
    };
  }

  const occurrences = event.event_occurrence ?? [];
  if (occurrences.length > 0 && !input.occurrenceId) {
    return { status: 400, message: tr("chooseADateForTheseTickets") };
  }

  const recipient = await recipientOf(input.target, event.country_code ?? null);
  if (!recipient) {
    return { status: 404, message: tr("noAccountForComplimentary") };
  }

  // The tickets last until the event (or the chosen date) is over.
  const chosen = occurrences.find((o) => o.id === input.occurrenceId);
  const ends = resolveEventEndDate(
    chosen ? chosen.starts_at : event.starts_at,
    chosen ? chosen.ends_at : event.ends_at,
    chosen ? [] : occurrences,
  );
  if (!ends) {
    return { status: 409, message: tr("thisEventHasNoScheduledDate") };
  }

  // A code and a QR for each ticket (the one step Postgres can't do).
  const made: {
    ticket_code: string;
    qr_public_id: string;
    qr_version: string;
  }[] = [];
  for (let i = 0; i < tickets; i++) {
    const ticketCode = generateTicketCode();
    const qr = await saveEventQrCodeToCloudinary(
      await generateQRCodeDataURL(ticketCode),
      ticketCode,
    );
    if ("error" in qr || !qr.public_id) {
      logger.error(
        `complimentary: QR upload failed (${"error" in qr ? qr.error : "no id"})`,
      );
      return { status: 500, message: tr("somethingWentWrong") };
    }
    made.push({
      ticket_code: ticketCode,
      qr_public_id: qr.public_id,
      qr_version: String(qr.version),
    });
  }

  const { error: issueError } = await getSupabaseServiceClient().rpc(
    "issue_complimentary_tickets",
    {
      p_event_id: event.id,
      p_ticket_type_id: type.id,
      p_recipient_id: recipient.id,
      p_given_by: personId,
      p_note: input.note ?? null,
      p_occurrence_id: input.occurrenceId ?? null,
      p_expires_at: ends.toISOString(),
      p_tickets: made,
    } as unknown as Database["public"]["Functions"]["issue_complimentary_tickets"]["Args"],
  );
  if (issueError) {
    // The function's own messages are written for the organizer.
    return {
      status: 409,
      message: userFacingError("complimentary: issue failed", issueError),
    };
  }

  // The recipient hears about it (a notice in their language, with a push).
  const { data: giver } = await getSupabaseServiceClient()
    .from("user_info")
    .select("full_name, username")
    .eq("id", accountId)
    .maybeSingle();
  await createNotificationCore(getSupabaseServiceClient(), {
    userId: recipient.id,
    type: "complimentary_tickets",
    notice: {
      id: "complimentary_tickets",
      params: {
        actor: giver?.full_name?.trim() || giver?.username || "",
        title: event.title,
        count: tickets,
      },
    },
    link: "/manage/my-events",
    data: { kind: "event", eventId: event.id },
  });

  return {
    status: 200,
    message: tr("complimentaryTicketsGiven", {
      count: tickets,
      name: recipient.name,
    }),
    data: { tickets },
  };
}
