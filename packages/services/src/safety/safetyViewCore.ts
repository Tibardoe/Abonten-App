import { logger } from "@abonten/core/logger";
import { isSafetyToken } from "@abonten/core/safety/links";
import {
  VIEW_POLL_SECONDS,
  isLocationVisible,
  isSessionOpen,
  locationState,
} from "@abonten/core/safety/rules";
import type {
  SafetyAcknowledgement,
  SafetyAlertReason,
  SafetyLocationPoint,
  SafetyResolution,
  SafetySessionKind,
  SafetySessionStatus,
  SafetyTimelineEntry,
  SafetyView,
} from "@abonten/types/safetyType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { AcknowledgeSafetyAlertInput } from "@abonten/validation/safetySchemas";
import { getMarketOrDefault } from "../markets/marketConfig";
import { checkRateLimit } from "../security/rateLimit";
import { notifyPerson } from "./safetyNotifyCore";
import { loadSafetyPerson } from "./safetyPeople";
import { type SafetyEnvelope, safetyError, safetyFail } from "./safetyShared";
import { safetyTokenHash } from "./safetyTokens";

// The page a contact (or the event team) opens from their alert:
// /sos/<token> on the website, the watch screen in the app. No account
// needed: the token is the contact's own link. Where the person is shows
// only while the session is open (and for a day after an alert ran out
// without anyone closing it); never once they said they are safe.

const TRAIL_POINTS = 20;
const VIEW_WRITE_EVERY_MS = 60_000;

async function findRecipient(svc: ServiceRoleClient, token: string) {
  const { data, error } = await svc
    .from("safety_recipient")
    .select("*")
    .eq("view_token_hash", safetyTokenHash(token))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function buildView(
  svc: ServiceRoleClient,
  recipient: NonNullable<Awaited<ReturnType<typeof findRecipient>>>,
  now: number,
): Promise<SafetyView | null> {
  const { data: session, error } = await svc
    .from("safety_session")
    .select("*")
    .eq("id", recipient.session_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!session) return null;

  const visible = isLocationVisible(
    {
      status: session.status as SafetySessionStatus,
      alertedAt: session.alerted_at,
      resolution: session.resolution,
      resolvedAt: session.resolved_at,
    },
    now,
  );
  const last: SafetyLocationPoint | null =
    visible &&
    session.last_lat !== null &&
    session.last_lng !== null &&
    session.last_located_at
      ? {
          lat: session.last_lat,
          lng: session.last_lng,
          accuracyM: session.last_accuracy_m,
          at: session.last_located_at,
        }
      : null;

  const [person, trail, timelineRows, others, eventRow, market] =
    await Promise.all([
      loadSafetyPerson(svc, session.user_id),
      visible
        ? svc
            .from("safety_location")
            .select("lat, lng, accuracy_m, recorded_at")
            .eq("session_id", session.id)
            .order("recorded_at", { ascending: false })
            .limit(TRAIL_POINTS)
        : Promise.resolve({
            data: [] as {
              lat: number;
              lng: number;
              accuracy_m: number | null;
              recorded_at: string;
            }[],
          }),
      svc
        .from("safety_session_event")
        .select("kind, at, recipient_id, detail")
        .eq("session_id", session.id)
        // Views are not news to other contacts; an SOS starts as the alert,
        // so its "started" would only repeat "pressed SOS".
        .not(
          "kind",
          "in",
          session.kind === "sos" ? "(viewed,started)" : "(viewed)",
        )
        .order("at"),
      svc
        .from("safety_recipient")
        .select("id, name")
        .eq("session_id", session.id),
      session.event_id
        ? svc
            .from("event")
            .select(
              "id, title, event_code, starts_at, ends_at, timezone, address, place:place_id(name, phone, whatsapp), organizer:user_info!organizer_id(username, full_name, organizer_verified, identity_verified, identity_valid_until, status_id)",
            )
            .eq("id", session.event_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      getMarketOrDefault(session.country_code),
    ]);

  const names = new Map((others.data ?? []).map((r) => [r.id, r.name]));
  const timeline: SafetyTimelineEntry[] = (timelineRows.data ?? []).map((e) => {
    const detail = (e.detail ?? {}) as Record<string, unknown>;
    return {
      kind: e.kind as SafetyTimelineEntry["kind"],
      at: e.at,
      name: e.recipient_id ? (names.get(e.recipient_id) ?? null) : null,
      acknowledgement:
        (detail.acknowledgement as SafetyAcknowledgement) ?? null,
      resolution: (detail.resolution as SafetyResolution) ?? null,
      reason: (detail.reason as SafetyAlertReason) ?? null,
    };
  });

  const event = eventRow.data as {
    id: string;
    title: string;
    event_code: string;
    starts_at: string | null;
    ends_at: string | null;
    timezone: string;
    address: unknown;
    place: {
      name: string;
      phone: string | null;
      whatsapp: string | null;
    } | null;
    organizer: {
      username: string | null;
      full_name: string | null;
      organizer_verified: boolean | null;
      identity_verified: boolean | null;
      identity_valid_until: string | null;
      status_id: number | null;
    } | null;
  } | null;
  const organizer =
    event?.organizer && event.organizer.status_id === 1
      ? event.organizer
      : null;
  const address =
    event?.address && typeof event.address === "object"
      ? (((event.address as { full_address?: unknown }).full_address as
          | string
          | undefined) ?? null)
      : null;
  const open = isSessionOpen(session.status as SafetySessionStatus);

  return {
    sessionId: session.id,
    kind: session.kind as SafetySessionKind,
    status: session.status as SafetySessionStatus,
    alertReason: session.alert_reason as SafetyAlertReason | null,
    startedAt: session.started_at,
    alertedAt: session.alerted_at,
    dueAt: session.due_at,
    endsAt: session.ends_at,
    resolvedAt: session.resolved_at,
    resolution: session.resolution as SafetyResolution | null,
    person: {
      name: person.name ?? "",
      avatarUrl: person.avatarUrl,
      phoneE164: person.phoneE164,
    },
    note: open ? session.note : null,
    event: event
      ? {
          id: event.id,
          title: event.title,
          code: event.event_code,
          venue: event.place?.name ?? null,
          address:
            typeof address === "string" && address.trim() ? address : null,
          startsAt: event.starts_at,
          endsAt: event.ends_at,
          timezone: event.timezone,
          timing: "ongoing",
          venuePhone: event.place?.phone?.trim() || null,
          venueWhatsapp: event.place?.whatsapp?.trim() || null,
          organizer:
            organizer && (organizer.full_name || organizer.username)
              ? {
                  name: (organizer.full_name || organizer.username) as string,
                  // The same rule as the public badge: a live check.
                  identityChecked:
                    !!organizer.identity_verified &&
                    !!organizer.identity_valid_until &&
                    Date.parse(organizer.identity_valid_until) > now,
                  verified: !!organizer.organizer_verified,
                }
              : null,
        }
      : null,
    locationState: locationState(
      {
        status: session.status as SafetySessionStatus,
        alertedAt: session.alerted_at,
        resolution: session.resolution,
        resolvedAt: session.resolved_at,
      },
      last,
      now,
    ),
    location: last,
    trail: (trail.data ?? [])
      .map((p) => ({
        lat: p.lat,
        lng: p.lng,
        accuracyM: p.accuracy_m,
        at: p.recorded_at,
      }))
      .reverse(),
    emergencyNumbers: market.emergencyNumbers,
    viewer: {
      name: recipient.name,
      kind: recipient.kind as "contact" | "event_team",
      acknowledgement:
        recipient.acknowledgement as SafetyAcknowledgement | null,
      acknowledgedAt: recipient.acknowledged_at,
    },
    timeline,
    pollSeconds: open ? VIEW_POLL_SECONDS : null,
    timezone: person.timezone,
    now: new Date(now).toISOString(),
  };
}

/** Records that the contact looked; the first look tells the person. */
async function recordView(
  svc: ServiceRoleClient,
  recipient: NonNullable<Awaited<ReturnType<typeof findRecipient>>>,
  view: SafetyView,
  now: number,
): Promise<void> {
  const at = new Date(now).toISOString();
  if (!recipient.first_viewed_at) {
    const { data: first } = await svc
      .from("safety_recipient")
      .update({ first_viewed_at: at, last_viewed_at: at, view_count: 1 })
      .eq("id", recipient.id)
      .is("first_viewed_at", null)
      .select("id, session_id")
      .maybeSingle();
    if (first) {
      await svc.from("safety_session_event").insert({
        session_id: recipient.session_id,
        kind: "viewed",
        recipient_id: recipient.id,
      });
      if (isSessionOpen(view.status)) {
        const { data: session } = await svc
          .from("safety_session")
          .select("user_id")
          .eq("id", recipient.session_id)
          .maybeSingle();
        if (session) {
          await notifyPerson(
            svc,
            session.user_id,
            {
              id: "safety_contact_viewed",
              params: { contact: recipient.name },
            },
            { sessionId: recipient.session_id },
          );
        }
      }
      return;
    }
  }
  if (
    !recipient.last_viewed_at ||
    now - Date.parse(recipient.last_viewed_at) >= VIEW_WRITE_EVERY_MS
  ) {
    await svc
      .from("safety_recipient")
      .update({ last_viewed_at: at, view_count: recipient.view_count + 1 })
      .eq("id", recipient.id);
  }
}

export async function getSafetyViewCore(
  svc: ServiceRoleClient,
  token: string,
  context: { ip: string },
): Promise<SafetyEnvelope<SafetyView>> {
  try {
    if (!isSafetyToken(token)) return safetyError(404, "linkInvalid");
    if (!(await checkRateLimit(`safety-view:${context.ip}`, 120, 60))) {
      return safetyError(429, "tooManyRequests");
    }
    const recipient = await findRecipient(svc, token);
    if (!recipient) return safetyError(404, "linkInvalid");
    const now = Date.now();
    const view = await buildView(svc, recipient, now);
    if (!view) return safetyError(404, "linkInvalid");
    await recordView(svc, recipient, view, now).catch((e) =>
      logger.error(`safety recordView: ${e}`),
    );
    return { status: 200, data: view };
  } catch (error) {
    logger.error(`getSafetyViewCore: ${error}`);
    return safetyFail();
  }
}

export async function acknowledgeSafetyAlertCore(
  svc: ServiceRoleClient,
  input: AcknowledgeSafetyAlertInput,
  context: { ip: string },
): Promise<SafetyEnvelope<SafetyView>> {
  try {
    if (!(await checkRateLimit(`safety-view:${context.ip}`, 120, 60))) {
      return safetyError(429, "tooManyRequests");
    }
    const recipient = await findRecipient(svc, input.token);
    if (!recipient) return safetyError(404, "linkInvalid");
    const { data: session } = await svc
      .from("safety_session")
      .select("id, user_id, status")
      .eq("id", recipient.session_id)
      .maybeSingle();
    if (!session) return safetyError(404, "linkInvalid");
    if (!isSessionOpen(session.status as SafetySessionStatus)) {
      return safetyError(410, "sessionClosed");
    }
    if (recipient.acknowledgement !== input.acknowledgement) {
      const at = new Date().toISOString();
      const { error } = await svc
        .from("safety_recipient")
        .update({
          acknowledgement: input.acknowledgement,
          acknowledged_at: at,
          first_viewed_at: recipient.first_viewed_at ?? at,
          last_viewed_at: at,
        })
        .eq("id", recipient.id);
      if (error) throw new Error(error.message);
      await svc.from("safety_session_event").insert({
        session_id: session.id,
        kind: "acknowledged",
        recipient_id: recipient.id,
        detail: { acknowledgement: input.acknowledgement },
      });
      await notifyPerson(
        svc,
        session.user_id,
        {
          id: "safety_contact_ack",
          params: { contact: recipient.name, ack: input.acknowledgement },
        },
        { sessionId: session.id, urgent: true },
      );
    }
    const fresh = await findRecipient(svc, input.token);
    const view = fresh ? await buildView(svc, fresh, Date.now()) : null;
    if (!view) return safetyError(404, "linkInvalid");
    return { status: 200, data: view };
  } catch (error) {
    logger.error(`acknowledgeSafetyAlertCore: ${error}`);
    return safetyFail();
  }
}
