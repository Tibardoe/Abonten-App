import { randomUUID } from "node:crypto";
import { logger } from "@abonten/core/logger";
import {
  type SafetyEventCandidate,
  rankSafetyEvents,
  safetyEventTiming,
} from "@abonten/core/safety/eventContext";
import { bestDelivery, sessionEndsAt } from "@abonten/core/safety/rules";
import type { Database, Json } from "@abonten/types/database.types";
import type {
  SafetyAcknowledgement,
  SafetyAlertReason,
  SafetyChannel,
  SafetyDeliveryState,
  SafetyEventContext,
  SafetyOverview,
  SafetyProgram,
  SafetyRecipientState,
  SafetyResolution,
  SafetySession,
  SafetySessionKind,
  SafetySessionStatus,
  SafetySessionSummary,
  StartSafetySessionResult,
} from "@abonten/types/safetyType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  RecordSafetyLocationInput,
  ResolveSafetySessionInput,
  SafetyLocationPointInput,
  StartSafetySessionInput,
  UpdateSafetySessionInput,
} from "@abonten/validation/safetySchemas";
import { getMarketOrDefault } from "../markets/marketConfig";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";
import { mapSafetyContact, readContactRows } from "./safetyContactsCore";
import {
  type SafetyDeps,
  ensureContactRecipients,
  loadRecipients,
  queueFollowUp,
  queueSessionMessages,
  sendSafetyMessages,
} from "./safetyNotifyCore";
import { loadSafetyPerson } from "./safetyPeople";
import { resolveSafetyAccess, safetyLimits } from "./safetyProgram";
import {
  PG_UNIQUE_VIOLATION,
  type SafetyEnvelope,
  safetyError,
  safetyFail,
} from "./safetyShared";
import { safetyTokenHash, viewTokenFor } from "./safetyTokens";

// One SOS, check-in or location share (docs/architecture/safety.md §5).
// A person has at most one open session; SOS during a check-in or a share
// turns that session into the alert, so contacts keep the link they have.
// Starting an alert never waits on anything that can be slow except the
// texts themselves (each has the provider's own 10-second deadline), and
// whatever cannot be sent now is retried by the safety-dispatch job.

type SessionRow = Database["public"]["Tables"]["safety_session"]["Row"];

const OPEN: SafetySessionStatus[] = ["active", "alerting"];
const HOUR = 60 * 60_000;

// ── Events ───────────────────────────────────────────────────────────

const EVENT_SELECT =
  "id, title, event_code, starts_at, ends_at, timezone, address, country_code, organizer_id, place:place_id(name), occurrences:event_occurrence(starts_at, ends_at)";

type EventRow = {
  id: string;
  title: string;
  event_code: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  address: Json;
  country_code: string;
  organizer_id: string;
  place: { name: string } | null;
  occurrences: { starts_at: string; ends_at: string }[] | null;
};

function addressText(address: Json): string | null {
  if (address && typeof address === "object" && !Array.isArray(address)) {
    const full = (address as { full_address?: unknown }).full_address;
    if (typeof full === "string" && full.trim()) return full.trim();
  }
  return null;
}

function candidateOf(e: EventRow): SafetyEventCandidate {
  return {
    id: e.id,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    occurrences: e.occurrences ?? null,
  };
}

function toEventContext(e: EventRow, now: number): SafetyEventContext {
  const timing = safetyEventTiming(candidateOf(e), now)?.timing;
  const ends = e.ends_at ? Date.parse(e.ends_at) : null;
  const starts = e.starts_at ? Date.parse(e.starts_at) : null;
  return {
    id: e.id,
    title: e.title,
    code: e.event_code,
    venue: e.place?.name ?? null,
    address: addressText(e.address),
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    timezone: e.timezone,
    timing:
      timing ??
      (starts !== null && starts > now
        ? "upcoming"
        : ends !== null && ends < now
          ? "ended"
          : "ongoing"),
  };
}

async function loadEvents(
  svc: ServiceRoleClient,
  ids: string[],
): Promise<Map<string, EventRow>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await svc
    .from("event")
    .select(EVENT_SELECT)
    .in("id", ids);
  if (error) {
    logger.error(`safety loadEvents: ${error.message}`);
    return new Map();
  }
  return new Map(((data ?? []) as unknown as EventRow[]).map((e) => [e.id, e]));
}

/** Events the person holds a ticket for that are on now, soon, or just ended. */
async function eventChoicesFor(
  svc: ServiceRoleClient,
  userId: string,
  now: number,
): Promise<SafetyEventContext[]> {
  const { data, error } = await svc
    .from("ticket")
    .select(
      "ticket_type:ticket_type_id!inner(event:event_id!inner(id, starts_at))",
    )
    .eq("user_id", userId)
    .in("status", ["active", "used"])
    .lte("ticket_type.event.starts_at", new Date(now + 12 * HOUR).toISOString())
    .gte(
      "ticket_type.event.starts_at",
      new Date(now - 7 * 24 * HOUR).toISOString(),
    )
    .limit(100);
  if (error) {
    logger.error(`safety eventChoicesFor: ${error.message}`);
    return [];
  }
  const ids = [
    ...new Set(
      (
        (data ?? []) as unknown as {
          ticket_type: { event: { id: string } } | null;
        }[]
      )
        .map((t) => t.ticket_type?.event?.id)
        .filter((x): x is string => !!x),
    ),
  ];
  const events = await loadEvents(svc, ids);
  const ranked = rankSafetyEvents([...events.values()].map(candidateOf), now);
  return ranked
    .slice(0, 5)
    .map((c) => events.get(c.id))
    .filter((e): e is EventRow => !!e)
    .map((e) => toEventContext(e, now));
}

async function holdsTicketFor(
  svc: ServiceRoleClient,
  userId: string,
  eventId: string,
): Promise<boolean> {
  const { data, error } = await svc
    .from("ticket")
    .select("id, ticket_type:ticket_type_id!inner(event_id)")
    .eq("user_id", userId)
    .eq("ticket_type.event_id", eventId)
    .in("status", ["active", "used"])
    .limit(1);
  if (error) {
    logger.error(`safety holdsTicketFor: ${error.message}`);
    return false;
  }
  return (data ?? []).length > 0;
}

// ── Reading a session ────────────────────────────────────────────────

async function readSession(
  svc: ServiceRoleClient,
  userId: string,
  sessionId: string,
): Promise<SessionRow | null> {
  const { data, error } = await svc
    .from("safety_session")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`safety session read failed: ${error.message}`);
  return data;
}

async function readOpenSession(
  svc: ServiceRoleClient,
  userId: string,
): Promise<SessionRow | null> {
  const { data, error } = await svc
    .from("safety_session")
    .select("*")
    .eq("user_id", userId)
    .in("status", OPEN)
    .maybeSingle();
  if (error)
    throw new Error(`safety open session read failed: ${error.message}`);
  return data;
}

export async function buildSafetySession(
  svc: ServiceRoleClient,
  row: SessionRow,
  program: SafetyProgram,
  now: number = Date.now(),
): Promise<SafetySession> {
  const [recipients, events] = await Promise.all([
    loadRecipients(svc, row.id),
    loadEvents(svc, row.event_id ? [row.event_id] : []),
  ]);
  const ids = recipients.map((r) => r.id);
  const { data: messages } = ids.length
    ? await svc
        .from("safety_message")
        .select("recipient_id, channel, status, created_at")
        .in("recipient_id", ids)
        .order("created_at")
    : {
        data: [] as {
          recipient_id: string | null;
          channel: string;
          status: string;
          created_at: string;
        }[],
      };

  const states = new Map<string, Record<SafetyChannel, SafetyDeliveryState>>();
  for (const r of recipients)
    states.set(r.id, { sms: "none", email: "none", push: "none" });
  for (const m of messages ?? []) {
    const state = m.recipient_id ? states.get(m.recipient_id) : null;
    // Ordered by time: the latest message on a channel says how it stands.
    if (state)
      state[m.channel as SafetyChannel] = m.status as SafetyDeliveryState;
  }

  const recipientStates: SafetyRecipientState[] = recipients.map((r) => {
    const channels = states.get(r.id) ?? {
      sms: "none",
      email: "none",
      push: "none",
    };
    return {
      id: r.id,
      kind: r.kind as "contact" | "event_team",
      contactId: r.contact_id,
      name: r.name,
      channels,
      delivery: bestDelivery(channels),
      viewedAt: r.first_viewed_at,
      acknowledgement: r.acknowledgement as SafetyAcknowledgement | null,
      acknowledgedAt: r.acknowledged_at,
    };
  });

  const told = row.alerted_at !== null || row.kind === "share";
  const textFromPhone = told
    ? recipients
        .filter((r) => r.kind === "contact" && r.phone_e164)
        .filter((r) => {
          const sms = states.get(r.id)?.sms ?? "none";
          return sms === "none" || sms === "failed" || sms === "skipped";
        })
        .map((r) => ({ name: r.name, phoneE164: r.phone_e164 as string }))
    : [];

  const event = row.event_id ? events.get(row.event_id) : null;
  return {
    id: row.id,
    kind: row.kind as SafetySessionKind,
    status: row.status as SafetySessionStatus,
    startedAt: row.started_at,
    dueAt: row.due_at,
    endsAt: row.ends_at,
    alertedAt: row.alerted_at,
    alertReason: row.alert_reason as SafetyAlertReason | null,
    resolvedAt: row.resolved_at,
    resolution: row.resolution as SafetyResolution | null,
    note: row.note,
    event: event ? toEventContext(event, now) : null,
    eventTeamNotifiedAt: row.event_team_notified_at,
    canTellEventTeam:
      program.eventTeam &&
      row.status === "alerting" &&
      !!row.event_id &&
      !row.event_team_notified_at,
    lastLocation:
      row.last_lat !== null && row.last_lng !== null && row.last_located_at
        ? {
            lat: row.last_lat,
            lng: row.last_lng,
            accuracyM: row.last_accuracy_m,
            at: row.last_located_at,
          }
        : null,
    recipients: recipientStates,
    textFromPhone,
  };
}

async function logEvent(
  svc: ServiceRoleClient,
  sessionId: string,
  kind: Database["public"]["Tables"]["safety_session_event"]["Insert"]["kind"],
  detail: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  const { error } = await svc
    .from("safety_session_event")
    .insert({ session_id: sessionId, kind, detail });
  if (error) logger.error(`safety timeline ${kind}: ${error.message}`);
}

async function recordPoints(
  svc: ServiceRoleClient,
  userId: string,
  sessionId: string,
  points: SafetyLocationPointInput[],
) {
  return svc.rpc("safety_record_locations", {
    p_session_id: sessionId,
    p_user_id: userId,
    p_points: points as unknown as Json,
  });
}

// ── Overview ─────────────────────────────────────────────────────────

export async function getSafetyOverviewCore(
  svc: ServiceRoleClient,
  userId: string,
): Promise<SafetyEnvelope<SafetyOverview>> {
  try {
    const now = Date.now();
    const [{ program }, person, contactRows, open, recent, eventChoices] =
      await Promise.all([
        resolveSafetyAccess(svc, userId),
        loadSafetyPerson(svc, userId),
        readContactRows(svc, userId),
        readOpenSession(svc, userId),
        svc
          .from("safety_session")
          .select(
            "id, kind, status, started_at, alerted_at, resolved_at, resolution, event_id, safety_recipient(count)",
          )
          .eq("user_id", userId)
          .in("status", ["resolved", "expired"])
          .order("started_at", { ascending: false })
          .limit(10),
        eventChoicesFor(svc, userId, now),
      ]);
    const market = await getMarketOrDefault(person.countryCode);
    const recentRows = (recent.data ?? []) as unknown as {
      id: string;
      kind: string;
      status: string;
      started_at: string;
      alerted_at: string | null;
      resolved_at: string | null;
      resolution: string | null;
      event_id: string | null;
      safety_recipient: { count: number }[];
    }[];
    const recentEvents = await loadEvents(svc, [
      ...new Set(
        recentRows.map((r) => r.event_id).filter((x): x is string => !!x),
      ),
    ]);
    const summaries: SafetySessionSummary[] = recentRows.map((r) => ({
      id: r.id,
      kind: r.kind as SafetySessionKind,
      status: r.status as SafetySessionStatus,
      startedAt: r.started_at,
      alertedAt: r.alerted_at,
      resolvedAt: r.resolved_at,
      resolution: r.resolution as SafetyResolution | null,
      recipientCount: r.safety_recipient?.[0]?.count ?? 0,
      eventTitle: r.event_id
        ? (recentEvents.get(r.event_id)?.title ?? null)
        : null,
    }));
    return {
      status: 200,
      data: {
        program,
        phone: { verified: !!person.phoneE164, e164: person.phoneE164 },
        contacts: await Promise.all(
          contactRows.map((c) => mapSafetyContact(c, now)),
        ),
        active: open ? await buildSafetySession(svc, open, program, now) : null,
        recent: summaries,
        eventChoices,
        emergencyNumbers: market.emergencyNumbers,
        countryCode: market.countryCode,
        timezone: person.timezone,
        needsName: !person.hasProfileName,
      },
    };
  } catch (error) {
    logger.error(`getSafetyOverviewCore: ${error}`);
    return safetyFail();
  }
}

// ── Starting ─────────────────────────────────────────────────────────

/** Whether this person may still have texts sent today (other sessions). */
async function smsAllowed(
  svc: ServiceRoleClient,
  userId: string,
  sessionId: string,
  limit: number,
): Promise<boolean> {
  const since = new Date(Date.now() - 24 * HOUR).toISOString();
  const { count, error } = await svc
    .from("safety_session")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("id", sessionId)
    .or(`alerted_at.gte.${since},and(kind.eq.share,started_at.gte.${since})`);
  if (error) {
    // Never let the limit's own failure silence an alert.
    logger.error(`safety smsAllowed: ${error.message}`);
    return true;
  }
  return (count ?? 0) < limit;
}

async function alertContacts(
  svc: ServiceRoleClient,
  session: SessionRow,
  purpose: "alert" | "check_in_missed" | "share",
  smsLimit: number,
  deps: SafetyDeps,
  contactIds?: string[] | null,
): Promise<void> {
  const recipients = await ensureContactRecipients(svc, session, contactIds);
  const ids = await queueSessionMessages(svc, {
    session,
    purpose,
    recipients,
    allowSms: await smsAllowed(svc, session.user_id, session.id, smsLimit),
  });
  await sendSafetyMessages(svc, { ids }, deps);
}

export async function startSafetySessionCore(
  svc: ServiceRoleClient,
  userId: string,
  input: StartSafetySessionInput,
  context: { createdVia: "app" | "web"; deps?: SafetyDeps },
): Promise<SafetyEnvelope<StartSafetySessionResult>> {
  const deps = context.deps ?? {};
  try {
    return await start(svc, userId, input, context.createdVia, deps, 0);
  } catch (error) {
    logger.error(`startSafetySessionCore: ${error}`);
    return safetyFail();
  }
}

async function start(
  svc: ServiceRoleClient,
  userId: string,
  input: StartSafetySessionInput,
  createdVia: "app" | "web",
  deps: SafetyDeps,
  attempt: number,
): Promise<SafetyEnvelope<StartSafetySessionResult>> {
  const now = Date.now();
  const { program, settings } = await resolveSafetyAccess(svc, userId);
  const limits = safetyLimits(settings);
  const points = input.location ? [input.location] : [];

  // The same button press again (a retry after a lost answer): no second alert.
  const { data: repeat } = await svc
    .from("safety_session")
    .select("*")
    .eq("user_id", userId)
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  if (repeat) {
    if (points.length) await recordPoints(svc, userId, repeat.id, points);
    const fresh = (await readSession(svc, userId, repeat.id)) ?? repeat;
    return {
      status: 200,
      data: {
        session: await buildSafetySession(svc, fresh, program),
        created: false,
        escalated: false,
      },
    };
  }

  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }

  const open = await readOpenSession(svc, userId);

  if (open && input.kind === "sos") {
    // SOS during a check-in or a share: that session becomes the alert. Allowed
    // even if the programme was switched off since it began.
    let row = open;
    if (open.status !== "alerting") {
      const { data: escalated, error } = await svc
        .from("safety_session")
        .update({
          status: "alerting",
          alerted_at: new Date(now).toISOString(),
          alert_reason: "sos",
          ends_at: new Date(now + limits.alert_hours * HOUR).toISOString(),
          ...(input.note ? { note: input.note } : {}),
        })
        .eq("id", open.id)
        .eq("status", open.status)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!escalated) {
        if (attempt === 0)
          return start(svc, userId, input, createdVia, deps, 1);
        return safetyError(409, "alreadyOpen");
      }
      row = escalated;
      await logEvent(svc, row.id, "alerted", { reason: "sos" });
    }
    if (points.length) await recordPoints(svc, userId, row.id, points);
    await alertContacts(
      svc,
      row,
      "alert",
      limits.alerts_with_sms_per_day,
      deps,
    );
    const fresh = (await readSession(svc, userId, row.id)) ?? row;
    return {
      status: 200,
      data: {
        session: await buildSafetySession(svc, fresh, program),
        created: false,
        escalated: open.status !== "alerting",
      },
    };
  }

  if (!program.enabled) return safetyError(403, "notAvailable");
  if (open) return safetyError(409, "alreadyOpen");
  if (input.kind === "check_in" && !program.checkIn)
    return safetyError(403, "checkInOff");
  if (input.kind === "share" && !program.share)
    return safetyError(403, "shareOff");

  const contacts = (await readContactRows(svc, userId)).filter(
    (c) => c.status !== "declined",
  );
  if (contacts.length === 0) return safetyError(409, "noContacts");

  // An event the person has no ticket for is dropped, never an error: an
  // alert must not fail over its context.
  let event: EventRow | null = null;
  if (input.eventId && (await holdsTicketFor(svc, userId, input.eventId))) {
    event = (await loadEvents(svc, [input.eventId])).get(input.eventId) ?? null;
  }
  const person = await loadSafetyPerson(svc, userId);

  const dueAt = input.kind === "check_in" ? now + input.minutes * 60_000 : null;
  const shareEndsAt =
    input.kind === "share"
      ? input.untilEventEnds && event?.ends_at
        ? Date.parse(event.ends_at)
        : now + (input.hours ?? 2) * HOUR
      : null;
  const endsAt = sessionEndsAt({
    kind: input.kind,
    now,
    alertHours: limits.alert_hours,
    shareMaxHours: limits.share_max_hours,
    dueAt,
    shareEndsAt,
  });

  const isSos = input.kind === "sos";
  const { data: row, error } = await svc
    .from("safety_session")
    .insert({
      id: randomUUID(),
      user_id: userId,
      kind: input.kind,
      status: isSos ? "alerting" : "active",
      client_request_id: input.clientRequestId,
      started_at: new Date(now).toISOString(),
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      ends_at: endsAt.toISOString(),
      alerted_at: isSos ? new Date(now).toISOString() : null,
      alert_reason: isSos ? "sos" : null,
      note: input.note?.trim() || null,
      event_id: event?.id ?? null,
      place_id: null,
      country_code: event?.country_code ?? person.countryCode,
      created_via: createdVia,
    })
    .select("*")
    .single();
  if (error || !row) {
    if (error?.code === PG_UNIQUE_VIOLATION && attempt === 0) {
      // Another press of the same button, or another session opened at the
      // same moment: answer from what is there now.
      return start(svc, userId, input, createdVia, deps, 1);
    }
    throw new Error(error?.message ?? "safety session insert returned nothing");
  }

  await logEvent(svc, row.id, "started", { kind: input.kind });
  if (isSos) await logEvent(svc, row.id, "alerted", { reason: "sos" });
  if (points.length) await recordPoints(svc, userId, row.id, points);

  if (isSos) {
    await alertContacts(
      svc,
      row,
      "alert",
      limits.alerts_with_sms_per_day,
      deps,
    );
  } else if (input.kind === "share") {
    await alertContacts(
      svc,
      row,
      "share",
      limits.alerts_with_sms_per_day,
      deps,
      input.contactIds ?? null,
    );
  }

  const fresh = (await readSession(svc, userId, row.id)) ?? row;
  return {
    status: 201,
    data: {
      session: await buildSafetySession(svc, fresh, program),
      created: true,
      escalated: false,
    },
  };
}

// ── While it is open ─────────────────────────────────────────────────

export async function recordSafetyLocationCore(
  svc: ServiceRoleClient,
  userId: string,
  input: RecordSafetyLocationInput,
): Promise<SafetyEnvelope<{ accepted: number; lastLocatedAt: string | null }>> {
  const { data, error } = await recordPoints(
    svc,
    userId,
    input.sessionId,
    input.points,
  );
  if (error) {
    logger.error(`recordSafetyLocationCore: ${error.message}`);
    return safetyFail();
  }
  const result = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    accepted?: number;
    lastLocatedAt?: string | null;
  };
  if (!result.ok) {
    if (result.reason === "closed") return safetyError(410, "sessionClosed");
    if (result.reason === "not_found")
      return safetyError(404, "sessionNotFound");
    return safetyError(400, "invalidLocation");
  }
  return {
    status: 200,
    data: {
      accepted: result.accepted ?? 0,
      lastLocatedAt: result.lastLocatedAt ?? null,
    },
  };
}

export async function updateSafetySessionCore(
  svc: ServiceRoleClient,
  userId: string,
  input: UpdateSafetySessionInput,
): Promise<SafetyEnvelope<SafetySession>> {
  try {
    const row = await readSession(svc, userId, input.sessionId);
    if (!row) return safetyError(404, "sessionNotFound");
    if (!OPEN.includes(row.status as SafetySessionStatus)) {
      return safetyError(410, "sessionClosed");
    }
    const { program, settings } = await resolveSafetyAccess(svc, userId);
    const patch: Database["public"]["Tables"]["safety_session"]["Update"] = {};
    if (input.note !== undefined) patch.note = input.note?.trim() || null;
    if (input.extendMinutes !== undefined) {
      if (row.kind !== "check_in" || row.status !== "active" || !row.due_at) {
        return safetyError(409, "extendOnlyCheckIn");
      }
      const due =
        Math.max(Date.parse(row.due_at), Date.now()) +
        input.extendMinutes * 60_000;
      patch.due_at = new Date(due).toISOString();
      patch.reminded_at = null;
      patch.ends_at = sessionEndsAt({
        kind: "check_in",
        now: Date.now(),
        alertHours: safetyLimits(settings).alert_hours,
        shareMaxHours: safetyLimits(settings).share_max_hours,
        dueAt: due,
      }).toISOString();
    }
    const { data, error } = await svc
      .from("safety_session")
      .update(patch)
      .eq("id", row.id)
      .eq("status", row.status)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return safetyError(409, "sessionChanged");
    if (input.note !== undefined) await logEvent(svc, row.id, "note");
    if (input.extendMinutes !== undefined) {
      await logEvent(svc, row.id, "extended", { minutes: input.extendMinutes });
    }
    return { status: 200, data: await buildSafetySession(svc, data, program) };
  } catch (error) {
    logger.error(`updateSafetySessionCore: ${error}`);
    return safetyFail();
  }
}

export async function resolveSafetySessionCore(
  svc: ServiceRoleClient,
  userId: string,
  input: ResolveSafetySessionInput,
  deps: SafetyDeps = {},
): Promise<SafetyEnvelope<SafetySession>> {
  try {
    const row = await readSession(svc, userId, input.sessionId);
    if (!row) return safetyError(404, "sessionNotFound");
    const { program } = await resolveSafetyAccess(svc, userId);
    if (!OPEN.includes(row.status as SafetySessionStatus)) {
      // Already over (a second tap, or it ran out): nothing more to do.
      return { status: 200, data: await buildSafetySession(svc, row, program) };
    }
    const alerted = row.alerted_at !== null;
    const resolution: SafetyResolution = alerted
      ? input.resolution === "false_alarm"
        ? "false_alarm"
        : "safe"
      : input.resolution;
    const { data, error } = await svc
      .from("safety_session")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolution,
      })
      .eq("id", row.id)
      .in("status", OPEN)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const closed = data ?? (await readSession(svc, userId, row.id)) ?? row;
    if (data) {
      await logEvent(svc, row.id, "resolved", { resolution });
      if (alerted) {
        const ids = await queueFollowUp(
          svc,
          row,
          resolution === "false_alarm" ? "false_alarm" : "safe",
        );
        await sendSafetyMessages(svc, { ids }, deps);
      }
    }
    return {
      status: 200,
      data: await buildSafetySession(svc, closed, program),
    };
  } catch (error) {
    logger.error(`resolveSafetySessionCore: ${error}`);
    return safetyFail();
  }
}

export async function tellEventTeamCore(
  svc: ServiceRoleClient,
  userId: string,
  sessionId: string,
  deps: SafetyDeps = {},
): Promise<SafetyEnvelope<SafetySession>> {
  try {
    const { program } = await resolveSafetyAccess(svc, userId);
    if (!program.eventTeam) return safetyError(403, "eventTeamOff");
    const row = await readSession(svc, userId, sessionId);
    if (!row) return safetyError(404, "sessionNotFound");
    if (row.status !== "alerting")
      return safetyError(409, "eventTeamNeedsAlert");
    if (!row.event_id) return safetyError(409, "noEventForSession");
    if (row.event_team_notified_at) {
      return { status: 200, data: await buildSafetySession(svc, row, program) };
    }
    const event = (await loadEvents(svc, [row.event_id])).get(row.event_id);
    if (!event || event.organizer_id === userId) {
      return safetyError(409, "noEventForSession");
    }
    const organizer = await loadSafetyPerson(svc, event.organizer_id);
    const id = randomUUID();
    const { error: insertError } = await svc.from("safety_recipient").insert({
      id,
      session_id: row.id,
      kind: "event_team",
      recipient_user_id: event.organizer_id,
      name: organizer.name ?? event.title,
      locale: organizer.locale,
      view_token_hash: safetyTokenHash(viewTokenFor(id)),
    });
    if (insertError && insertError.code !== PG_UNIQUE_VIOLATION) {
      throw new Error(insertError.message);
    }
    const { data: updated, error } = await svc
      .from("safety_session")
      .update({ event_team_notified_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("event_team_notified_at", null)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (updated) {
      await logEvent(svc, row.id, "event_team");
      const recipients = (await loadRecipients(svc, row.id)).filter(
        (r) => r.kind === "event_team",
      );
      const ids = await queueSessionMessages(svc, {
        session: row,
        purpose: "event_team",
        recipients,
        allowSms: false,
      });
      await sendSafetyMessages(svc, { ids }, deps);
    }
    const fresh = (await readSession(svc, userId, row.id)) ?? row;
    return { status: 200, data: await buildSafetySession(svc, fresh, program) };
  } catch (error) {
    logger.error(`tellEventTeamCore: ${error}`);
    return safetyFail();
  }
}

// ── Used by the dispatcher ───────────────────────────────────────────

/** A check-in that was just escalated: tell the contacts and the person. */
export async function alertMissedCheckIn(
  svc: ServiceRoleClient,
  sessionId: string,
  deps: SafetyDeps,
): Promise<void> {
  const { data: row } = await svc
    .from("safety_session")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!row || row.status !== "alerting") return;
  const { settings } = await resolveSafetyAccess(svc, row.user_id);
  await alertContacts(
    svc,
    row,
    "check_in_missed",
    safetyLimits(settings).alerts_with_sms_per_day,
    deps,
  );
}
