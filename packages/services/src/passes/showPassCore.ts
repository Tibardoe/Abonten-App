// Passes for several shows of a run (docs/architecture/show-passes.md).
// Shared by the web actions addShowPass / getShowPass / claimShowPass and
// POST /api/mobile/organizer/events/:eventId/passes,
// GET + POST /api/mobile/tickets/:ticketId/pass.
//
// The organizer sells a pass on every show of a run still to come
// (event_series_add_pass). A buyer buys it on one show like any ticket —
// that ticket admits there and its money settles with that show — then
// chooses the other shows from the ticket (ticket_pass_claim): each choice
// is a ticket for that show, out of its stock and seats, with no money
// moved.

import { resolveEventEndDate } from "@abonten/core/dateFormatter";
import { logger } from "@abonten/core/logger";
import {
  type PassSetupProblem,
  type PassState,
  passSetupProblem,
  passShowChoosable,
  passStateFromRow,
} from "@abonten/core/showPasses";
import { userFacingError } from "@abonten/core/userFacingError";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";
import { requireVerifiedIdentity } from "../identity/identityCore";
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

const CHECK_VIOLATION = "23514";

export type AddShowPassInput = {
  eventId: string;
  name: string;
  /** Shows the pass covers, the bought one included. */
  shows: number;
  /** In the event's currency, major units. */
  price: number;
  /** Passes each show takes; null = no limit of its own. */
  quantity: number | null;
};

export type AddShowPassResult =
  | { status: 200; message: string; data: { added: number; skipped: number } }
  | { status: 400 | 403 | 404 | 409 | 500; message: string };

function setupProblemMessage(problem: PassSetupProblem): string {
  switch (problem) {
    case "name":
      return tr("passNameProblem");
    case "shows":
      return tr("passShowsProblem");
    case "price":
      return tr("passPriceProblem");
    case "quantity":
      return tr("passQuantityProblem");
  }
}

export async function addShowPassCore(
  supabase: SupabaseClient<Database>,
  accountId: string,
  input: AddShowPassInput,
): Promise<AddShowPassResult> {
  if (await isAccountRestricted(accountId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const problem = passSetupProblem(input);
  if (problem) return { status: 400, message: setupProblemMessage(problem) };

  // The caller's own client: only the organizer (or a member acting for
  // them) reads the listing here.
  const { data: event, error } = await supabase
    .from("event")
    .select("id, status, series_id")
    .eq("id", input.eventId)
    .eq("organizer_id", accountId)
    .maybeSingle();
  if (error) {
    logger.error(`addShowPass: listing read failed (${error.message})`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (!event) {
    return { status: 404, message: tr("eventNotFoundOrUnauthorized") };
  }
  if (!event.series_id) {
    return { status: 409, message: tr("passNeedsARun") };
  }

  // A pass is a paid ticket: selling it needs a traceable organizer, when
  // that is required.
  const identityGate = await requireVerifiedIdentity(
    getSupabaseServiceClient(),
    accountId,
    "paid_events",
  );
  if (identityGate) {
    return {
      status: identityGate.status === 503 ? 500 : 409,
      message: identityGate.message ?? tr("somethingWentWrong"),
    };
  }

  const { data, error: rpcError } = await getSupabaseServiceClient().rpc(
    "event_series_add_pass",
    {
      p_event_id: event.id,
      p_name: input.name.trim(),
      p_shows: input.shows,
      p_price: input.price,
      // PostgREST drops undefined keys; null is "no limit".
      p_quantity: input.quantity ?? (null as unknown as number),
    },
  );
  if (rpcError) {
    return {
      status: rpcError.code === CHECK_VIOLATION ? 400 : 500,
      message:
        rpcError.code === CHECK_VIOLATION
          ? userFacingError("addShowPass", rpcError)
          : tr("somethingWentWrong"),
    };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const added = Number(row?.added ?? 0);
  const skipped = Number(row?.skipped ?? 0);
  if (added === 0) {
    return { status: 409, message: tr("passNoShowCouldTakeIt") };
  }
  return {
    status: 200,
    message: tr("passOnSale", { added, skipped }),
    data: { added, skipped },
  };
}

export type GetShowPassResult =
  | { status: 200; data: PassState }
  | { status: 404 | 500; message: string };

/** The pass a ticket carries, for its holder; 404 when it is not a pass. */
export async function getShowPassCore(
  holderId: string,
  ticketId: string,
): Promise<GetShowPassResult> {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "ticket_pass_state",
    { p_pass_ticket: ticketId, p_holder: holderId },
  );
  if (error) {
    logger.error(`getShowPass: state read failed (${error.message})`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  const state = passStateFromRow(data);
  if (!state) return { status: 404, message: tr("passNotFound") };
  return { status: 200, data: state };
}

export type ClaimShowPassResult =
  | { status: 200; message: string; data: { ticketId: string } }
  | { status: 400 | 403 | 404 | 409 | 500; message: string };

/** Uses a pass for one more show of its run: a ticket for that show. */
export async function claimShowPassCore(
  holderId: string,
  input: { ticketId: string; eventId: string },
): Promise<ClaimShowPassResult> {
  if (await isAccountRestricted(holderId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  // Asked first so a show that can't be chosen costs no QR upload; the
  // database decides again under its lock.
  const current = await getShowPassCore(holderId, input.ticketId);
  if (current.status !== 200) return current;
  const target = current.data.shows.find((s) => s.eventId === input.eventId);
  if (!target || !passShowChoosable(current.data, target)) {
    return { status: 409, message: tr("passShowNotChoosable") };
  }

  const service = getSupabaseServiceClient();
  const { data: show, error } = await service
    .from("event")
    .select("id, title, starts_at, ends_at")
    .eq("id", input.eventId)
    .maybeSingle();
  if (error) {
    logger.error(`claimShowPass: show read failed (${error.message})`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (!show) return { status: 404, message: tr("passShowNotFound") };
  const ends = resolveEventEndDate(show.starts_at, show.ends_at, []);
  if (!ends) {
    return { status: 409, message: tr("thisEventHasNoScheduledDate") };
  }

  // A code and a QR for the new ticket (the one step Postgres can't do).
  const ticketCode = generateTicketCode();
  const qr = await saveEventQrCodeToCloudinary(
    await generateQRCodeDataURL(ticketCode),
    ticketCode,
  );
  if ("error" in qr || !qr.public_id) {
    logger.error(
      `claimShowPass: QR upload failed (${"error" in qr ? qr.error : "no id"})`,
    );
    return { status: 500, message: tr("somethingWentWrong") };
  }

  const { data: ticketId, error: claimError } = await service.rpc(
    "ticket_pass_claim",
    {
      p_pass_ticket: input.ticketId,
      p_holder: holderId,
      p_event_id: show.id,
      p_expires_at: ends.toISOString(),
      p_ticket: {
        ticket_code: ticketCode,
        qr_public_id: qr.public_id,
        qr_version: String(qr.version),
      },
    },
  );
  if (claimError || !ticketId) {
    // The function's own messages are written for the holder.
    return {
      status: claimError?.code === CHECK_VIOLATION ? 409 : 500,
      message:
        claimError?.code === CHECK_VIOLATION
          ? userFacingError("claimShowPass", claimError)
          : tr("somethingWentWrong"),
    };
  }
  return {
    status: 200,
    message: tr("passShowChosen", { title: show.title }),
    data: { ticketId: ticketId as string },
  };
}
