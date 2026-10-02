import { resolveEventEndDate } from "@abonten/core/dateFormatter";
import {
  resolveOccurrenceState,
  validatePurchaseOccurrence,
} from "@abonten/core/eventPurchaseEligibility";
import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import {
  generateQRCodeDataURL,
  generateTicketCode,
} from "../tickets/generateTicketCode";
import { saveEventQrCodeToCloudinary } from "../tickets/saveEventQrCodeToCloudinary";

// Post-auth body of registerForFreeEvent, shared by the "use server" action
// and the mobile API route (`/api/mobile/checkout/free-rsvp`) so both run
// the exact same one-click RSVP. Caller supplies an already-authenticated
// Supabase client + resolved userId. Quantity is always exactly 1 and is
// never taken from the client. `revalidatePath` and the confirmation email
// (React template + Resend) stay in apps/web: the caller passes
// `onRegistered`, which the web wrapper schedules via next/server `after`.
//
// The DB mutation — free ticket_type lookup, atomic 1-unit reservation,
// ticket + attendance insert, sales-window re-check against now() — is done
// in one transaction by the `issue_free_ticket` SECURITY DEFINER RPC
// (migration 20260906222054). Only QR generation + the Cloudinary upload
// happen here (the one step Postgres can't do). No client session inserts
// `ticket` directly anymore.

type TicketWithEvent = {
  user_id: string;
  ticket_type_id: { event_id: string };
  status: string;
};

export type RegisterForFreeEventCoreResult = {
  status: number;
  message: string;
  eventCode?: string;
};

export async function registerForFreeEventCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  occurrenceId?: string | null,
  onRegistered?: (ticketId: string) => void,
): Promise<RegisterForFreeEventCoreResult> {
  const { data: rawTicketData, error: ticketDataError } = await supabase
    .from("ticket")
    .select("user_id, status, ticket_type_id(event_id)")
    .eq("user_id", userId);

  if (ticketDataError || !rawTicketData) {
    logger.error(`Error fetching ticket data: ${ticketDataError?.message}`);
    return { status: 500, message: tr("somethingWentWrong2") };
  }

  const ticketData = rawTicketData as unknown as TicketWithEvent[];

  const alreadyBought = ticketData?.some(
    (ticket) =>
      ticket.ticket_type_id.event_id === eventId &&
      (ticket.status === "active" || ticket.status === "used"),
  );

  if (alreadyBought) {
    return {
      status: 300,
      message: tr("ticketForThisEventAlreadyBought"),
    };
  }

  const { data: event, error: eventFetchError } = await supabase
    .from("event")
    .select(
      "event_code, status, starts_at, ends_at, event_occurrence(id, starts_at, ends_at)",
    )
    .eq("id", eventId)
    .maybeSingle();

  if (eventFetchError || !event) {
    logger.error(`Failed fetching event: ${eventFetchError?.message}`);
    return { status: 500, message: tr("somethingWentWrong2") };
  }

  // Fast-fail on the obvious cases before spending a Cloudinary upload — the
  // issue_free_ticket RPC re-checks all of this against now() as the
  // authoritative gate.
  if (event.status !== "published") {
    return {
      status: 409,
      message: tr("thisEventIsNoLongerAccepting"),
    };
  }

  const occurrenceState = resolveOccurrenceState(
    event.starts_at,
    event.ends_at,
    event.event_occurrence,
  );

  if (occurrenceState.blockReason === "no_dates") {
    logger.error(`Event ${eventId} has no resolvable start/end date`);
    return {
      status: 500,
      message: tr("thisEventHasNoScheduledDate"),
    };
  }

  if (occurrenceState.blockReason === "ended") {
    return { status: 409, message: tr("thisEventHasEnded") };
  }

  if (occurrenceState.blockReason === "ongoing_no_future") {
    return {
      status: 409,
      message: tr("thisEventIsCurrentlyInProgress"),
    };
  }

  const eventEndDate = resolveEventEndDate(
    event.starts_at,
    event.ends_at,
    event.event_occurrence,
  );

  if (!eventEndDate) {
    logger.error(`Event ${eventId} has no resolvable start/end date`);
    return {
      status: 500,
      message: tr("thisEventHasNoScheduledDate"),
    };
  }

  if (occurrenceId) {
    const occurrenceCheck = validatePurchaseOccurrence(
      occurrenceId,
      event.event_occurrence,
    );

    if (!occurrenceCheck.ok) {
      return occurrenceCheck.reason === "unknown"
        ? { status: 400, message: tr("invalidEventDate") }
        : {
            status: 409,
            message: tr("thatDateHasAlreadyStartedPick"),
          };
    }
  }

  const ticketCode = generateTicketCode();
  const qrCodeBase64 = await generateQRCodeDataURL(ticketCode);
  const uploadResponse = await saveEventQrCodeToCloudinary(
    qrCodeBase64,
    ticketCode,
  );

  if ("error" in uploadResponse) {
    logger.error(`Error saving QR code to cloudinary:${uploadResponse.error}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  // One atomic transaction: reserve 1 free unit, re-check the sales window +
  // occurrence, insert ticket + attendance. On any failure nothing is
  // written, so there is no reservation to hand back — only a (rare,
  // race-only) orphan QR in Cloudinary, same as the paid path.
  // Service role: the RPC trusts the ticket code, QR and expiry it is
  // given, so only the server may call it (migration 20260925110000);
  // userId is the caller's own, resolved from their session.
  const { data: ticketId, error: issueError } =
    await getSupabaseServiceClient().rpc("issue_free_ticket", {
      p_user_id: userId,
      p_event_id: eventId,
      p_occurrence_id: occurrenceId ?? null,
      p_ticket_code: ticketCode,
      p_qr_public_id: uploadResponse.public_id,
      p_qr_version: String(uploadResponse.version),
      p_expires_at: eventEndDate.toISOString(),
    } as unknown as Database["public"]["Functions"]["issue_free_ticket"]["Args"]);

  if (issueError || !ticketId) {
    logger.error(
      `issue_free_ticket failed for event ${eventId}, user ${userId}: ${issueError?.message}`,
    );
    const message = issueError?.message ?? "";
    // The RPC's own exception messages are user-safe.
    if (/already bought/i.test(message)) {
      return {
        status: 300,
        message: tr("ticketForThisEventAlreadyBought"),
      };
    }
    return {
      status: 409,
      message: message || tr("somethingWentWrong"),
    };
  }

  // The confirmation email (React PDF + Resend) is apps/web-only — the
  // caller schedules it via next/server `after` once this returns 200.
  onRegistered?.(ticketId as string);

  return {
    status: 200,
    message: tr("eventRegisteredSuccessfully"),
    eventCode: event.event_code,
  };
}
