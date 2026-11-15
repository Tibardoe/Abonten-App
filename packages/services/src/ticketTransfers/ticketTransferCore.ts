import { logger } from "@abonten/core/logger";
import { formatPhoneInternational, parsePhone } from "@abonten/core/phone";
import { newTicketCode } from "@abonten/core/ticketTransfers/ticketCode";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  IncomingTicketTransfer,
  OutgoingTicketTransfer,
  SendTicketTarget,
  TicketSendBlock,
  TicketTransferPerson,
  TicketTransferProgram,
  TicketTransferRecipient,
  TicketTransferState,
  TicketTransferStatus,
} from "@abonten/types/ticketTransferType";
import { tr } from "../i18n/requestLocale";
import { destroyAssetIfUnused } from "../media/assetReferences";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";
import { generateQRCodeDataURL } from "../tickets/generateTicketCode";
import { saveEventQrCodeToCloudinary } from "../tickets/saveEventQrCodeToCloudinary";
import {
  noticeTransferAccepted,
  noticeTransferCancelled,
  noticeTransferDeclined,
  noticeTransferReceived,
  textTransferInvite,
} from "./ticketTransferNotices";
import {
  isTicketTransfersKillSwitchOn,
  resolveTicketTransferAccess,
} from "./ticketTransferProgram";

// Send a ticket to a friend (docs/architecture/ticket-transfers.md).
//
// Every function takes the service-role client and a user id the transport
// has already proved; the ticket_transfer table and every ticket_transfer_*
// function are service-role only. The database functions hold the rules
// (holder, active, date not over, move limit, one open offer, receiver
// match, free-ticket rule) under row locks; this layer adds the programme
// switch, the account checks that need the auth admin API, the new code and
// QR, the notices and the text to a number with no account.

type Fail = {
  status: 400 | 401 | 403 | 404 | 409 | 429 | 500;
  message: string;
};
type Ok<T> = { status: 200; data: T };

const PERSON_SELECT =
  "id, full_name, username, avatar_public_id, avatar_version";

type PersonRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_public_id: string | null;
  avatar_version: string | null;
};

function toPerson(row: PersonRow): TicketTransferPerson {
  return {
    id: row.id,
    name: row.full_name,
    username: row.username,
    avatarPublicId: row.avatar_public_id,
    avatarVersion: row.avatar_version,
  };
}

/** "+233 24 *** 4567": enough to recognise a number, not to read it out. */
export function maskPhone(e164: string): string {
  const international = formatPhoneInternational(e164);
  const digits = international.replace(/\D/g, "");
  let seen = 0;
  const keepFrom = digits.length - 4;
  return international.replace(/\d/g, (d) => {
    const index = seen++;
    // Keep the dial code's first group and the last four digits.
    if (index < 3 || index >= keepFrom) return d;
    return "*";
  });
}

// --- Errors ------------------------------------------------------------------

const SQL_ERRORS: Record<string, { status: Fail["status"]; key: string }> = {
  not_holder: { status: 404, key: "ticketTransferNotYours" },
  ticket_not_active: { status: 409, key: "ticketTransferNotActive" },
  event_over: { status: 409, key: "ticketTransferEventOver" },
  too_many_moves: { status: 409, key: "ticketTransferTooManyMoves" },
  organizer_off: { status: 409, key: "ticketTransferOrganizerOff" },
  self: { status: 400, key: "ticketTransferSelf" },
  receiver_unavailable: {
    status: 409,
    key: "ticketTransferReceiverUnavailable",
  },
  receiver_has_free_ticket: {
    status: 409,
    key: "ticketTransferReceiverHasFree",
  },
  already_pending: { status: 409, key: "ticketTransferAlreadyPending" },
  not_found: { status: 404, key: "ticketTransferNotFound" },
  not_pending: { status: 409, key: "ticketTransferNotPending" },
  expired: { status: 409, key: "ticketTransferExpired" },
  not_receiver: { status: 404, key: "ticketTransferNotForYou" },
  ticket_changed: { status: 409, key: "ticketTransferTicketChanged" },
  no_receiver: { status: 400, key: "ticketTransferNoReceiver" },
};

/** Turns a `ticket_transfer:<code>` database error into an envelope. */
function failFromDb(error: { message?: string } | null, where: string): Fail {
  const code = /ticket_transfer:([a-z_]+)/.exec(error?.message ?? "")?.[1];
  if (code === "sender_restricted") {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const known = code ? SQL_ERRORS[code] : undefined;
  if (known) return { status: known.status, message: tr(known.key) };
  logger.error(`${where}: ${error?.message ?? "no error text"}`);
  return { status: 500, message: tr("somethingWentWrong") };
}

// --- Reads -------------------------------------------------------------------

type TicketForTransfer = {
  id: string;
  user_id: string;
  status: string;
  transfer_count: number;
  expires_at: string;
  ticket_type: {
    event: { id: string; status: string } | null;
  } | null;
};

async function readTicket(
  svc: ServiceRoleClient,
  ticketId: string,
): Promise<TicketForTransfer | null> {
  const { data, error } = await svc
    .from("ticket")
    .select(
      "id, user_id, status, transfer_count, expires_at, ticket_type:ticket_type_id(event:event_id(id, status))",
    )
    .eq("id", ticketId)
    .maybeSingle();
  if (error) logger.error(`ticketTransfer readTicket: ${error.message}`);
  return (data as unknown as TicketForTransfer | null) ?? null;
}

async function organizerAllows(
  svc: ServiceRoleClient,
  eventId: string,
): Promise<boolean> {
  const { data } = await svc
    .from("event_ticket_transfer_setting")
    .select("enabled")
    .eq("event_id", eventId)
    .maybeSingle();
  return data?.enabled ?? true;
}

type TransferRow = {
  id: string;
  ticket_id: string;
  event_id: string;
  from_user_id: string;
  to_user_id: string | null;
  to_phone: string | null;
  status: string;
  created_at: string;
  expires_at: string;
};

const TRANSFER_SELECT =
  "id, ticket_id, event_id, from_user_id, to_user_id, to_phone, status, created_at, expires_at";

async function people(
  svc: ServiceRoleClient,
  ids: string[],
): Promise<Map<string, TicketTransferPerson>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await svc
    .from("user_info")
    .select(PERSON_SELECT)
    .in("id", unique);
  if (error) logger.error(`ticketTransfer people: ${error.message}`);
  return new Map(
    ((data ?? []) as PersonRow[]).map((row) => [row.id, toPerson(row)]),
  );
}

function toOutgoing(
  row: TransferRow,
  persons: Map<string, TicketTransferPerson>,
): OutgoingTicketTransfer {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    status: row.status as TicketTransferStatus,
    to: row.to_user_id ? (persons.get(row.to_user_id) ?? null) : null,
    toPhoneMasked: row.to_phone ? maskPhone(row.to_phone) : null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function getTicketTransferProgramCore(
  svc: ServiceRoleClient,
  userId: string | null,
): Promise<Ok<TicketTransferProgram>> {
  const { program } = await resolveTicketTransferAccess(svc, userId);
  return { status: 200, data: program };
}

/** What the ticket screen shows: can it be sent, and is an offer open. */
export async function getTicketTransferStateCore(
  svc: ServiceRoleClient,
  userId: string,
  ticketId: string,
): Promise<Ok<TicketTransferState> | Fail> {
  const ticket = await readTicket(svc, ticketId);
  if (!ticket || ticket.user_id !== userId) {
    return { status: 404, message: tr("ticketNotFound") };
  }
  const { program } = await resolveTicketTransferAccess(svc, userId);
  const event = ticket.ticket_type?.event ?? null;

  const { data: open } = await svc
    .from("ticket_transfer")
    .select(TRANSFER_SELECT)
    .eq("ticket_id", ticketId)
    .eq("status", "pending")
    .maybeSingle();
  const pendingRow = (open as TransferRow | null) ?? null;
  const persons = await people(
    svc,
    pendingRow?.to_user_id ? [pendingRow.to_user_id] : [],
  );

  let block: TicketSendBlock | null = null;
  if (!program.enabled) block = "program_off";
  else if (await isAccountRestricted(userId)) block = "restricted";
  else if (ticket.status !== "active") block = "not_active";
  else if (
    !event ||
    event.status !== "published" ||
    new Date(ticket.expires_at).getTime() <= Date.now()
  )
    block = "event_over";
  else if (ticket.transfer_count >= program.maxMoves) block = "too_many_moves";
  else if (!(await organizerAllows(svc, event.id))) block = "organizer_off";

  return {
    status: 200,
    data: {
      canSend: block === null && !pendingRow,
      block,
      movesLeft: Math.max(0, program.maxMoves - ticket.transfer_count),
      pending: pendingRow ? toOutgoing(pendingRow, persons) : null,
    },
  };
}

/** Every open offer this person made, for the badges on their tickets. */
export async function listOutgoingTicketTransfersCore(
  svc: ServiceRoleClient,
  userId: string,
): Promise<Ok<OutgoingTicketTransfer[]> | Fail> {
  const { data, error } = await svc
    .from("ticket_transfer")
    .select(TRANSFER_SELECT)
    .eq("from_user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return failFromDb(error, "listOutgoingTicketTransfersCore");
  const rows = (data ?? []) as TransferRow[];
  const persons = await people(
    svc,
    rows.flatMap((r) => (r.to_user_id ? [r.to_user_id] : [])),
  );
  return { status: 200, data: rows.map((r) => toOutgoing(r, persons)) };
}

async function verifiedPhone(
  svc: ServiceRoleClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await svc.rpc("_ticket_transfer_verified_phone", {
    p_user_id: userId,
  });
  if (error) logger.error(`ticketTransfer verifiedPhone: ${error.message}`);
  return (data as string | null) ?? null;
}

/** Offers waiting for this person: named, or sent to their verified number. */
export async function listIncomingTicketTransfersCore(
  svc: ServiceRoleClient,
  userId: string,
): Promise<Ok<IncomingTicketTransfer[]> | Fail> {
  const now = new Date().toISOString();
  const named = svc
    .from("ticket_transfer")
    .select(TRANSFER_SELECT)
    .eq("to_user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(50);
  const phone = await verifiedPhone(svc, userId);
  const byPhone = phone
    ? svc
        .from("ticket_transfer")
        .select(TRANSFER_SELECT)
        .is("to_user_id", null)
        .eq("to_phone", phone)
        .eq("status", "pending")
        .gt("expires_at", now)
        .order("created_at", { ascending: false })
        .limit(50)
    : null;
  const [a, b] = await Promise.all([named, byPhone]);
  if (a.error) return failFromDb(a.error, "listIncomingTicketTransfersCore");
  if (b?.error) return failFromDb(b.error, "listIncomingTicketTransfersCore");
  const rows = [
    ...((a.data ?? []) as TransferRow[]),
    ...((b?.data ?? []) as TransferRow[]),
  ]
    // An offer to your own number from yourself is not an offer.
    .filter((r) => r.from_user_id !== userId);
  if (rows.length === 0) return { status: 200, data: [] };

  const [persons, tickets] = await Promise.all([
    people(
      svc,
      rows.map((r) => r.from_user_id),
    ),
    svc
      .from("ticket")
      .select(
        "id, ticket_type:ticket_type_id(type, event:event_id(id, title, event_code, starts_at, ends_at, timezone, flyer_public_id, flyer_version))",
      )
      .in(
        "id",
        rows.map((r) => r.ticket_id),
      ),
  ]);
  if (tickets.error) {
    return failFromDb(tickets.error, "listIncomingTicketTransfersCore");
  }
  type TicketRow = {
    id: string;
    ticket_type: {
      type: string | null;
      event: {
        id: string;
        title: string;
        event_code: string;
        starts_at: string | null;
        ends_at: string | null;
        timezone: string | null;
        flyer_public_id: string | null;
        flyer_version: string | null;
      } | null;
    } | null;
  };
  const byTicket = new Map(
    ((tickets.data ?? []) as unknown as TicketRow[]).map((t) => [t.id, t]),
  );
  const data: IncomingTicketTransfer[] = [];
  for (const row of rows) {
    const from = persons.get(row.from_user_id);
    const ticket = byTicket.get(row.ticket_id);
    const event = ticket?.ticket_type?.event;
    if (!from || !event) continue;
    data.push({
      id: row.id,
      ticketId: row.ticket_id,
      from,
      ticketType: ticket?.ticket_type?.type ?? null,
      event: {
        id: event.id,
        title: event.title,
        eventCode: event.event_code,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        timezone: event.timezone,
        flyerPublicId: event.flyer_public_id,
        flyerVersion: event.flyer_version,
      },
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    });
  }
  return { status: 200, data };
}

// --- Choosing who ------------------------------------------------------------

async function senderCountry(
  svc: ServiceRoleClient,
  userId: string,
): Promise<string> {
  const { data } = await svc
    .from("user_info")
    .select("country_code")
    .eq("id", userId)
    .maybeSingle();
  return data?.country_code?.trim() || "GH";
}

async function personByUsername(
  svc: ServiceRoleClient,
  username: string,
): Promise<PersonRow | null> {
  const handle = username.trim().replace(/^@+/, "");
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(handle)) return null;
  const { data, error } = await svc
    .from("user_info")
    .select(`${PERSON_SELECT}, status_id`)
    .ilike("username", handle)
    .eq("status_id", 1)
    .maybeSingle();
  if (error) logger.error(`ticketTransfer personByUsername: ${error.message}`);
  return (data as PersonRow | null) ?? null;
}

/**
 * Who the sender is about to send to. A username shows its public name and
 * photo; a number is only checked and masked, never said to belong to
 * anyone, so the lookup cannot be used to test numbers.
 */
export async function findTicketTransferRecipientCore(
  svc: ServiceRoleClient,
  userId: string,
  target: SendTicketTarget,
): Promise<Ok<TicketTransferRecipient> | Fail> {
  if (target.kind === "username") {
    const row = await personByUsername(svc, target.username);
    if (!row) {
      return { status: 404, message: tr("ticketTransferAccountNotFound") };
    }
    if (row.id === userId) {
      return { status: 400, message: tr("ticketTransferSelf") };
    }
    return { status: 200, data: { kind: "account", person: toPerson(row) } };
  }
  const parsed = parsePhone(target.phone, await senderCountry(svc, userId));
  if (!parsed.ok) {
    return { status: 400, message: tr("ticketTransferPhoneInvalid") };
  }
  return {
    status: 200,
    data: {
      kind: "phone",
      phoneE164: parsed.e164,
      phoneMasked: maskPhone(parsed.e164),
    },
  };
}

// --- Send --------------------------------------------------------------------

async function textsSentToday(
  svc: ServiceRoleClient,
  userId: string,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await svc
    .from("ticket_transfer")
    .select("id", { count: "exact", head: true })
    .eq("from_user_id", userId)
    .gte("text_sent_at", since);
  if (error) logger.error(`ticketTransfer textsSentToday: ${error.message}`);
  return count ?? 0;
}

export async function sendTicketCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { ticketId: string; target: SendTicketTarget },
  deps: { canTextNumber: (e164: string) => Promise<boolean> },
): Promise<Ok<OutgoingTicketTransfer> | Fail> {
  const access = await resolveTicketTransferAccess(svc, userId);
  if (!access.program.enabled) {
    return { status: 403, message: tr("ticketTransferUnavailable") };
  }
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }

  let toUserId: string | null = null;
  let toPhone: string | null = null;
  if (input.target.kind === "username") {
    const row = await personByUsername(svc, input.target.username);
    if (!row) {
      return { status: 404, message: tr("ticketTransferAccountNotFound") };
    }
    toUserId = row.id;
  } else {
    const parsed = parsePhone(
      input.target.phone,
      await senderCountry(svc, userId),
    );
    if (!parsed.ok) {
      return { status: 400, message: tr("ticketTransferPhoneInvalid") };
    }
    toPhone = parsed.e164;
    const { data: owner } = await svc.rpc("ticket_transfer_user_by_phone", {
      p_phone: toPhone,
    });
    if (!owner) {
      // Nobody has this number yet: the offer reaches them by text, so it
      // needs a number Abonten can text and a text left for today.
      if (!(await deps.canTextNumber(toPhone))) {
        return { status: 409, message: tr("ticketTransferCannotText") };
      }
      if ((await textsSentToday(svc, userId)) >= access.textsPerSenderPerDay) {
        return { status: 429, message: tr("ticketTransferTextLimit") };
      }
    }
  }

  const { data, error } = await svc.rpc("ticket_transfer_send", {
    p_ticket_id: input.ticketId,
    p_from_user_id: userId,
    p_to_user_id: toUserId,
    p_to_phone: toPhone,
  });
  if (error) return failFromDb(error, "sendTicketCore");
  const sent = (data ?? [])[0];
  if (!sent) return { status: 500, message: tr("somethingWentWrong") };

  if (sent.resolved_to_user_id) {
    await noticeTransferReceived(sent.transfer_id);
  } else if (toPhone) {
    const texted = await textTransferInvite(sent.transfer_id);
    if (texted) {
      await svc
        .from("ticket_transfer")
        .update({ text_sent_at: new Date().toISOString() })
        .eq("id", sent.transfer_id);
    }
  }

  const { data: row } = await svc
    .from("ticket_transfer")
    .select(TRANSFER_SELECT)
    .eq("id", sent.transfer_id)
    .single();
  const persons = await people(
    svc,
    sent.resolved_to_user_id ? [sent.resolved_to_user_id] : [],
  );
  return { status: 200, data: toOutgoing(row as TransferRow, persons) };
}

// --- Answer ------------------------------------------------------------------

/**
 * The receiver takes the ticket. A new code and QR are made first; the
 * database then moves the ticket, its attendee row and its code in one
 * transaction. If that fails, the new QR is removed; if it succeeds, the
 * old one is.
 */
export async function acceptTicketTransferCore(
  svc: ServiceRoleClient,
  userId: string,
  transferId: string,
): Promise<Ok<{ ticketId: string }> | Fail> {
  if (isTicketTransfersKillSwitchOn()) {
    return { status: 409, message: tr("ticketTransferPaused") };
  }
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }

  const code = newTicketCode();
  let qrPublicId: string;
  let qrVersion: string;
  try {
    const upload = await saveEventQrCodeToCloudinary(
      await generateQRCodeDataURL(code),
      code,
    );
    if (upload.error || !upload.public_id || upload.version == null) {
      throw new Error(upload.error ?? "no public id");
    }
    qrPublicId = upload.public_id;
    qrVersion = String(upload.version);
  } catch (error) {
    logger.error(`acceptTicketTransferCore: QR upload failed (${error})`);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  const { data, error } = await svc.rpc("ticket_transfer_accept", {
    p_transfer_id: transferId,
    p_user_id: userId,
    p_new_code: code,
    p_qr_public_id: qrPublicId,
    p_qr_version: qrVersion,
  });
  if (error) {
    await destroyAssetIfUnused(qrPublicId).catch((e) =>
      logger.warn(`acceptTicketTransferCore: new QR not removed (${e})`),
    );
    return failFromDb(error, "acceptTicketTransferCore");
  }
  const moved = (data ?? [])[0];
  if (!moved) return { status: 500, message: tr("somethingWentWrong") };

  if (moved.old_qr_public_id) {
    await destroyAssetIfUnused(moved.old_qr_public_id).catch((e) =>
      logger.warn(`acceptTicketTransferCore: old QR not removed (${e})`),
    );
  }
  await noticeTransferAccepted(transferId);
  return { status: 200, data: { ticketId: moved.ticket_id } };
}

export async function declineTicketTransferCore(
  svc: ServiceRoleClient,
  userId: string,
  transferId: string,
): Promise<Ok<{ transferId: string }> | Fail> {
  const { error } = await svc.rpc("ticket_transfer_decline", {
    p_transfer_id: transferId,
    p_user_id: userId,
  });
  if (error) return failFromDb(error, "declineTicketTransferCore");
  await noticeTransferDeclined(transferId);
  return { status: 200, data: { transferId } };
}

export async function cancelTicketTransferCore(
  svc: ServiceRoleClient,
  userId: string,
  transferId: string,
): Promise<Ok<{ transferId: string }> | Fail> {
  const { data, error } = await svc.rpc("ticket_transfer_cancel", {
    p_transfer_id: transferId,
    p_user_id: userId,
  });
  if (error) return failFromDb(error, "cancelTicketTransferCore");
  if ((data ?? [])[0]?.to_user_id) await noticeTransferCancelled(transferId);
  return { status: 200, data: { transferId } };
}

// --- The organizer's switch --------------------------------------------------

async function ownsEvent(
  svc: ServiceRoleClient,
  userId: string,
  eventId: string,
): Promise<boolean | null> {
  const { data, error } = await svc
    .from("event")
    .select("organizer_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    logger.error(`ticketTransfer ownsEvent: ${error.message}`);
    return null;
  }
  return data?.organizer_id === userId;
}

export async function getEventTicketTransferSettingCore(
  svc: ServiceRoleClient,
  userId: string,
  eventId: string,
): Promise<Ok<{ enabled: boolean; programEnabled: boolean }> | Fail> {
  const owns = await ownsEvent(svc, userId, eventId);
  if (owns === null) return { status: 500, message: tr("somethingWentWrong") };
  if (!owns) return { status: 404, message: tr("eventNotFound") };
  const { program } = await resolveTicketTransferAccess(svc, userId);
  return {
    status: 200,
    data: {
      enabled: await organizerAllows(svc, eventId),
      programEnabled: program.enabled,
    },
  };
}

export async function setEventTicketTransferSettingCore(
  svc: ServiceRoleClient,
  userId: string,
  eventId: string,
  enabled: boolean,
): Promise<Ok<{ enabled: boolean }> | Fail> {
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const owns = await ownsEvent(svc, userId, eventId);
  if (owns === null) return { status: 500, message: tr("somethingWentWrong") };
  if (!owns) return { status: 404, message: tr("eventNotFound") };
  const { error } = await svc.from("event_ticket_transfer_setting").upsert(
    {
      event_id: eventId,
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: "event_id" },
  );
  if (error) return failFromDb(error, "setEventTicketTransferSettingCore");
  return { status: 200, data: { enabled } };
}
