import { logger } from "@abonten/core/logger";
import { maskPhoneNumber } from "@abonten/core/phone/phone";
import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  SafetyAcknowledgement,
  SafetyAdminMessageRow,
  SafetyAdminOverview,
  SafetyAdminSessionDetail,
  SafetyAdminSessionRow,
  SafetyAdminSettings,
  SafetyAlertReason,
  SafetyChannel,
  SafetyDeliveryState,
  SafetyMessagePurpose,
  SafetyResolution,
  SafetySessionKind,
  SafetySessionStatus,
  SafetyTimelineEntry,
} from "@abonten/types/safetyType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  SafetyAdminSessionListInput,
  SafetySettingsInput,
} from "@abonten/validation/safetySchemas";
import {
  isSafetyKillSwitchOn,
  mapSafetySettings,
  readSafetySettings,
  resetSafetySettingsCache,
} from "../../safety/safetyProgram";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Admin › Safety. What support needs to answer "my contact never got the
// text": which sessions there were, who was told, whether each text, email
// and push went, and who answered. Never where anyone was: positions are
// not read here, and a note is answered only as "has a note".
// Reads need safety.view; settings changes need safety.configure (step-up,
// checked by the admin transport), a reason and the row's updated_at.

type RequestMeta = Record<string, unknown> | undefined;

const denied = <T>(e: unknown): AdminEnvelope<T> =>
  adminError(e) as AdminEnvelope<T>;

// ── Settings ────────────────────────────────────────────────────────

export async function getSafetySettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<
  AdminEnvelope<{ settings: SafetyAdminSettings; killSwitch: boolean }>
> {
  try {
    assertPermission(ctx, "safety.view");
  } catch (e) {
    return denied(e);
  }
  const row = await readSafetySettings(supabase, { fresh: true });
  if (!row) return { status: 500, message: "Couldn't load the settings." };
  return {
    status: 200,
    data: {
      settings: mapSafetySettings(row),
      killSwitch: isSafetyKillSwitchOn(),
    },
  };
}

const COLUMN: Record<keyof SafetySettingsInput["patch"], string> = {
  enabled: "enabled",
  audience: "audience",
  betaUserIds: "beta_user_ids",
  checkInEnabled: "check_in_enabled",
  shareEnabled: "share_enabled",
  eventTeamAlertsEnabled: "event_team_alerts_enabled",
  maxContacts: "max_contacts",
  alertsWithSmsPerDay: "alerts_with_sms_per_day",
  invitesPerDay: "invites_per_day",
  checkInGraceMinutes: "check_in_grace_minutes",
  alertHours: "alert_hours",
  shareMaxHours: "share_max_hours",
  locationRetentionDays: "location_retention_days",
  sessionRetentionDays: "session_retention_days",
};

export async function updateSafetySettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: SafetySettingsInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<SafetyAdminSettings>> {
  try {
    assertPermission(ctx, "safety.configure");
  } catch (e) {
    return denied(e);
  }
  const beforeRow = await readSafetySettings(supabase, { fresh: true });
  if (!beforeRow)
    return { status: 500, message: "Couldn't load the settings." };
  const before = mapSafetySettings(beforeRow);

  const update: Record<string, unknown> = {};
  const changed: (keyof SafetyAdminSettings)[] = [];
  for (const [key, value] of Object.entries(input.patch)) {
    const column = COLUMN[key as keyof typeof COLUMN];
    if (!column || value === undefined) continue;
    if (
      JSON.stringify(before[key as keyof SafetyAdminSettings]) ===
      JSON.stringify(value)
    ) {
      continue;
    }
    update[column] = value;
    changed.push(key as keyof SafetyAdminSettings);
  }
  if (changed.length === 0) return { status: 400, message: "Nothing changed." };
  update.updated_at = new Date().toISOString();
  update.updated_by = ctx.userId;

  const { data, error } = await supabase
    .from("safety_program_setting")
    .update(update as never)
    .eq("id", 1)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  if (error) {
    logger.error(`updateSafetySettingsCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't save the settings." };
  }
  if (!data) {
    return {
      status: 409,
      message: "Someone else changed these settings. Reload and try again.",
    };
  }
  resetSafetySettingsCache();
  const after = mapSafetySettings(data);
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "safety.settings.update",
    targetType: "safety_program_setting",
    targetId: "1",
    summary: `Abonten Safety settings changed: ${changed.join(", ")}`,
    reason: input.reason,
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Settings saved.", data: after };
}

// ── Overview ────────────────────────────────────────────────────────

async function countRows(
  query: PromiseLike<{
    count: number | null;
    error: { message: string } | null;
  }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getSafetyAdminOverviewCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  windowDays = 30,
): Promise<AdminEnvelope<SafetyAdminOverview>> {
  try {
    assertPermission(ctx, "safety.view");
  } catch (e) {
    return denied(e);
  }
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const sessions = () =>
    supabase
      .from("safety_session")
      .select("id", { count: "exact", head: true });
  const messages = () =>
    supabase
      .from("safety_message")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
  const contacts = () =>
    supabase
      .from("safety_contact")
      .select("id", { count: "exact", head: true });
  try {
    const [
      sos,
      checkIn,
      share,
      alerts,
      missed,
      mistakes,
      open,
      sent,
      failed,
      pending,
      total,
      accepted,
      declined,
      people,
    ] = await Promise.all([
      countRows(sessions().eq("kind", "sos").gte("started_at", since)),
      countRows(sessions().eq("kind", "check_in").gte("started_at", since)),
      countRows(sessions().eq("kind", "share").gte("started_at", since)),
      countRows(sessions().gte("alerted_at", since)),
      countRows(
        sessions()
          .eq("alert_reason", "check_in_missed")
          .gte("alerted_at", since),
      ),
      countRows(
        sessions().eq("resolution", "false_alarm").gte("started_at", since),
      ),
      countRows(sessions().in("status", ["active", "alerting"])),
      countRows(messages().eq("status", "sent")),
      countRows(messages().eq("status", "failed")),
      countRows(messages().in("status", ["pending", "sending"])),
      countRows(contacts()),
      countRows(contacts().eq("status", "accepted")),
      countRows(contacts().eq("status", "declined")),
      supabase
        .from("safety_contact")
        .select("user_id")
        .limit(10_000)
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          return new Set((data ?? []).map((r) => r.user_id)).size;
        }),
    ]);
    return {
      status: 200,
      data: {
        windowDays,
        sessionsByKind: { sos, check_in: checkIn, share },
        alerts,
        missedCheckIns: missed,
        falseAlarms: mistakes,
        openNow: open,
        messages: { sent, failed, pending },
        contacts: { total, accepted, declined },
        peopleWithContacts: people,
      },
    };
  } catch (error) {
    logger.error(`getSafetyAdminOverviewCore: ${error}`);
    return { status: 500, message: "Couldn't load the overview." };
  }
}

// ── Sessions ────────────────────────────────────────────────────────

type SessionListRow = {
  id: string;
  user_id: string;
  kind: string;
  status: string;
  alert_reason: string | null;
  resolution: string | null;
  started_at: string;
  alerted_at: string | null;
  resolved_at: string | null;
  created_via: string;
  event_id: string | null;
};

const SESSION_COLUMNS =
  "id, user_id, kind, status, alert_reason, resolution, started_at, alerted_at, resolved_at, created_via, event_id";

async function summarise(
  supabase: ServiceRoleClient,
  rows: SessionListRow[],
): Promise<SafetyAdminSessionRow[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const eventIds = [
    ...new Set(rows.map((r) => r.event_id).filter((x): x is string => !!x)),
  ];
  const [{ data: recipients }, { data: people }, { data: events }] =
    await Promise.all([
      supabase
        .from("safety_recipient")
        .select("id, session_id, first_viewed_at, acknowledgement")
        .in("session_id", ids),
      supabase
        .from("user_info")
        .select("id, full_name, username")
        .in("id", userIds),
      eventIds.length
        ? supabase.from("event").select("id, title").in("id", eventIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ]);
  const recipientIds = (recipients ?? []).map((r) => r.id);
  const { data: messages } = recipientIds.length
    ? await supabase
        .from("safety_message")
        .select("recipient_id, status")
        .in("recipient_id", recipientIds)
    : { data: [] as { recipient_id: string | null; status: string }[] };
  const sessionOf = new Map(
    (recipients ?? []).map((r) => [r.id, r.session_id]),
  );
  const names = new Map(
    (people ?? []).map((p) => [
      p.id,
      p.full_name || (p.username ? `@${p.username}` : null),
    ]),
  );
  const titles = new Map((events ?? []).map((e) => [e.id, e.title]));
  return rows.map((r) => {
    const mine = (recipients ?? []).filter((x) => x.session_id === r.id);
    const mineMessages = (messages ?? []).filter(
      (m) => m.recipient_id && sessionOf.get(m.recipient_id) === r.id,
    );
    return {
      id: r.id,
      userId: r.user_id,
      userName: names.get(r.user_id) ?? null,
      kind: r.kind as SafetySessionKind,
      status: r.status as SafetySessionStatus,
      alertReason: r.alert_reason as SafetyAlertReason | null,
      resolution: r.resolution as SafetyResolution | null,
      startedAt: r.started_at,
      alertedAt: r.alerted_at,
      resolvedAt: r.resolved_at,
      recipients: mine.length,
      viewed: mine.filter((x) => x.first_viewed_at).length,
      acknowledged: mine.filter((x) => x.acknowledgement).length,
      messagesSent: mineMessages.filter((m) => m.status === "sent").length,
      messagesFailed: mineMessages.filter((m) => m.status === "failed").length,
      eventTitle: r.event_id ? (titles.get(r.event_id) ?? null) : null,
      createdVia: r.created_via as "app" | "web",
    };
  });
}

export async function listSafetySessionsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: SafetyAdminSessionListInput,
): Promise<
  AdminEnvelope<{ rows: SafetyAdminSessionRow[]; nextBefore: string | null }>
> {
  try {
    assertPermission(ctx, "safety.view");
  } catch (e) {
    return denied(e);
  }
  let query = supabase
    .from("safety_session")
    .select(SESSION_COLUMNS)
    .order("started_at", { ascending: false })
    .limit(input.limit + 1);
  if (input.kind) query = query.eq("kind", input.kind);
  if (input.status) query = query.eq("status", input.status);
  if (input.before) query = query.lt("started_at", input.before);
  const { data, error } = await query;
  if (error) {
    logger.error(`listSafetySessionsCore: ${error.message}`);
    return { status: 500, message: "Couldn't load the sessions." };
  }
  const rows = (data ?? []) as SessionListRow[];
  const page = rows.slice(0, input.limit);
  return {
    status: 200,
    data: {
      rows: await summarise(supabase, page),
      nextBefore:
        rows.length > input.limit
          ? (page[page.length - 1]?.started_at ?? null)
          : null,
    },
  };
}

export async function getSafetySessionAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  sessionId: string,
): Promise<AdminEnvelope<SafetyAdminSessionDetail>> {
  try {
    assertPermission(ctx, "safety.view");
  } catch (e) {
    return denied(e);
  }
  // Deliberately no last_lat / last_lng, and the note only as a yes/no:
  // staff never see where anyone was or what they wrote to their contacts.
  const { data: row, error } = await supabase
    .from("safety_session")
    .select(
      `${SESSION_COLUMNS}, due_at, ends_at, location_count, last_located_at, note`,
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    logger.error(`getSafetySessionAdminCore: ${error.message}`);
    return { status: 500, message: "Couldn't load the session." };
  }
  if (!row) return { status: 404, message: "Session not found." };
  const [summary] = await summarise(supabase, [row as SessionListRow]);
  const [{ data: recipients }, { data: timeline }] = await Promise.all([
    supabase
      .from("safety_recipient")
      .select(
        "id, kind, name, phone_e164, first_viewed_at, view_count, acknowledgement, acknowledged_at",
      )
      .eq("session_id", sessionId)
      .order("created_at"),
    supabase
      .from("safety_session_event")
      .select("kind, at, recipient_id, detail")
      .eq("session_id", sessionId)
      .order("at"),
  ]);
  const recipientIds = (recipients ?? []).map((r) => r.id);
  const { data: messages } = recipientIds.length
    ? await supabase
        .from("safety_message")
        .select(
          "id, recipient_id, purpose, channel, status, attempts, last_error, created_at, sent_at",
        )
        .in("recipient_id", recipientIds)
        .order("created_at")
    : { data: [] };
  const nameOf = new Map((recipients ?? []).map((r) => [r.id, r.name]));
  const typed = row as unknown as {
    due_at: string | null;
    ends_at: string;
    location_count: number;
    last_located_at: string | null;
    note: string | null;
  };
  return {
    status: 200,
    data: {
      ...summary,
      dueAt: typed.due_at,
      endsAt: typed.ends_at,
      hasNote: !!typed.note,
      locationCount: typed.location_count,
      lastLocatedAt: typed.last_located_at,
      recipientsDetail: (recipients ?? []).map((r) => ({
        id: r.id,
        kind: r.kind as "contact" | "event_team",
        name: r.name,
        maskedPhone: r.phone_e164 ? maskPhoneNumber(r.phone_e164) : null,
        viewedAt: r.first_viewed_at,
        viewCount: r.view_count,
        acknowledgement: r.acknowledgement as SafetyAcknowledgement | null,
        acknowledgedAt: r.acknowledged_at,
      })),
      messages: (messages ?? []).map(
        (m): SafetyAdminMessageRow => ({
          id: m.id,
          recipientName: m.recipient_id
            ? (nameOf.get(m.recipient_id) ?? null)
            : null,
          purpose: m.purpose as SafetyMessagePurpose,
          channel: m.channel as SafetyChannel,
          status: m.status as SafetyDeliveryState,
          attempts: m.attempts,
          lastError: m.last_error,
          createdAt: m.created_at,
          sentAt: m.sent_at,
        }),
      ),
      timeline: (timeline ?? []).map((e) => {
        const detail = (e.detail ?? {}) as Record<string, unknown>;
        return {
          kind: e.kind as SafetyTimelineEntry["kind"],
          at: e.at,
          name: e.recipient_id ? (nameOf.get(e.recipient_id) ?? null) : null,
          acknowledgement:
            (detail.acknowledgement as SafetyAcknowledgement) ?? null,
          resolution: (detail.resolution as SafetyResolution) ?? null,
          reason: (detail.reason as SafetyAlertReason) ?? null,
        };
      }),
    },
  };
}
