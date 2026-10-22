import { randomUUID } from "node:crypto";
import { logger } from "@abonten/core/logger";
import {
  formatPhoneInternational,
  phoneCountry,
} from "@abonten/core/phone/phone";
import { primaryEmergencyNumber } from "@abonten/core/safety/emergencyNumbers";
import { safetyViewPath } from "@abonten/core/safety/links";
import { nextAttemptAt } from "@abonten/core/safety/rules";
import type { Database } from "@abonten/types/database.types";
import type {
  SafetyChannel,
  SafetyMessagePurpose,
} from "@abonten/types/safetyType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { getMarketOrDefault } from "../markets/marketConfig";
import { createNotificationCore } from "../notifications/createNotification";
import { sendHubtelSms } from "../sms/hubtelSms";
import {
  type SafetyPerson,
  canTextNumber,
  loadSafetyPerson,
} from "./safetyPeople";
import {
  inviteUrlFor,
  safetyTokenHash,
  viewTokenFor,
  viewUrlFor,
} from "./safetyTokens";
import {
  safetyClockTime,
  safetyEmailWords,
  safetyNoticeFor,
  safetySmsText,
} from "./safetyWords";

// The Safety outbox (safety_message). Every text, email and push is a row
// first and is sent second, so a request that dies half-way, a provider that
// times out or a dispatcher run that overlaps another can neither lose a
// message nor send it twice: rows are unique per (recipient, purpose,
// channel) — per (contact, channel, round) for invites — and are claimed
// with skip-locked row locks by safety_claim_messages(). The request that
// queues an alert sends it at once; the safety-dispatch job retries what
// failed (1, 2 and 5 minutes later; a timed-out text is retried too, since
// in an emergency a duplicate is better than nothing).

type SessionRow = Database["public"]["Tables"]["safety_session"]["Row"];
export type SafetyRecipientRow =
  Database["public"]["Tables"]["safety_recipient"]["Row"];
type ContactRow = Database["public"]["Tables"]["safety_contact"]["Row"];
type MessageRow = Database["public"]["Tables"]["safety_message"]["Row"];

export type SafetyEmail = {
  to: string;
  locale: string;
  subject: string;
  heading: string;
  intro: string;
  buttonLabel: string;
  buttonUrl: string;
  lines: string[];
  footer: string;
  urgent: boolean;
  idempotencyKey: string;
};

export type SafetyEmailResult =
  | { ok: true }
  | { ok: false; error: string; retry: boolean };

/** What the transport lends the services: the services have no email sender. */
export type SafetyDeps = {
  sendEmail?: (email: SafetyEmail) => Promise<SafetyEmailResult>;
};

const URGENT: ReadonlySet<SafetyMessagePurpose> = new Set([
  "alert",
  "check_in_missed",
  "event_team",
]);

const PARALLEL = 5;

async function inBatches<T>(items: T[], run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += PARALLEL) {
    await Promise.all(items.slice(i, i + PARALLEL).map(run));
  }
}

/** Numbers that asked not to be texted about `userId` (or about anyone). */
export async function optedOutPhones(
  svc: ServiceRoleClient,
  userId: string,
  phones: string[],
): Promise<Set<string>> {
  const unique = [...new Set(phones.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const { data, error } = await svc
    .from("safety_contact_optout")
    .select("phone_e164, user_id")
    .in("phone_e164", unique);
  if (error) {
    logger.error(`safety optedOutPhones: ${error.message}`);
    return new Set();
  }
  return new Set(
    (data ?? [])
      .filter((r) => r.user_id === null || r.user_id === userId)
      .map((r) => r.phone_e164),
  );
}

export async function loadRecipients(
  svc: ServiceRoleClient,
  sessionId: string,
): Promise<SafetyRecipientRow[]> {
  const { data, error } = await svc
    .from("safety_recipient")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at");
  if (error) throw new Error(`safety recipients read failed: ${error.message}`);
  return data ?? [];
}

/**
 * Makes sure every eligible contact (not declined, not opted out, and in
 * `contactIds` when given) is a recipient of the session. Idempotent: a
 * contact already told about this session keeps their row and their link.
 */
export async function ensureContactRecipients(
  svc: ServiceRoleClient,
  session: Pick<SessionRow, "id" | "user_id">,
  contactIds?: string[] | null,
): Promise<SafetyRecipientRow[]> {
  const { data: contacts, error } = await svc
    .from("safety_contact")
    .select("*")
    .eq("user_id", session.user_id)
    .neq("status", "declined")
    .order("position")
    .order("created_at");
  if (error) throw new Error(`safety contacts read failed: ${error.message}`);
  let chosen: ContactRow[] = contacts ?? [];
  if (contactIds && contactIds.length > 0) {
    const wanted = new Set(contactIds);
    chosen = chosen.filter((c) => wanted.has(c.id));
  }
  const blocked = await optedOutPhones(
    svc,
    session.user_id,
    chosen.map((c) => c.phone_e164),
  );
  chosen = chosen.filter((c) => !blocked.has(c.phone_e164));

  if (chosen.length > 0) {
    const rows = chosen.map((c) => {
      const id = randomUUID();
      return {
        id,
        session_id: session.id,
        kind: "contact",
        contact_id: c.id,
        recipient_user_id: c.contact_user_id,
        name: c.name,
        phone_e164: c.phone_e164,
        email: c.email,
        locale: c.locale,
        view_token_hash: safetyTokenHash(viewTokenFor(id)),
      };
    });
    const { error: insertError } = await svc
      .from("safety_recipient")
      .upsert(rows, {
        onConflict: "session_id,contact_id",
        ignoreDuplicates: true,
      });
    if (insertError) {
      throw new Error(`safety recipients write failed: ${insertError.message}`);
    }
  }

  const recipients = await loadRecipients(svc, session.id);
  // A contact who accepted (and linked their account) after this session
  // began should get the alert's push too.
  const linked = new Map(
    chosen
      .filter((c) => c.contact_user_id)
      .map((c) => [c.id, c.contact_user_id]),
  );
  for (const r of recipients) {
    const user = r.contact_id ? linked.get(r.contact_id) : null;
    if (user && !r.recipient_user_id) {
      await svc
        .from("safety_recipient")
        .update({ recipient_user_id: user })
        .eq("id", r.id);
      r.recipient_user_id = user;
    }
  }
  const wanted = new Set(chosen.map((c) => c.id));
  return recipients.filter(
    (r) => r.kind === "contact" && r.contact_id && wanted.has(r.contact_id),
  );
}

/**
 * Queues `purpose` to each recipient on every channel that can reach them:
 * a text when the number has a rail and `allowSms`, an email when they gave
 * one, a push when they are an Abonten account. Returns the new row ids.
 */
export async function queueSessionMessages(
  svc: ServiceRoleClient,
  input: {
    session: Pick<SessionRow, "id" | "user_id">;
    purpose: SafetyMessagePurpose;
    recipients: SafetyRecipientRow[];
    allowSms: boolean;
    /** Only these channels per recipient (follow-ups reuse what was used). */
    channels?: Map<string, Set<SafetyChannel>>;
  },
): Promise<number[]> {
  const rows: {
    user_id: string;
    recipient_id: string;
    purpose: SafetyMessagePurpose;
    channel: SafetyChannel;
  }[] = [];
  for (const r of input.recipients) {
    const only = input.channels?.get(r.id);
    const want = (c: SafetyChannel) => !only || only.has(c);
    const base = {
      user_id: input.session.user_id,
      recipient_id: r.id,
      purpose: input.purpose,
    };
    if (
      input.allowSms &&
      input.purpose !== "event_team" &&
      want("sms") &&
      r.phone_e164 &&
      (await canTextNumber(r.phone_e164))
    ) {
      rows.push({ ...base, channel: "sms" });
    }
    if (input.purpose !== "event_team" && want("email") && r.email) {
      rows.push({ ...base, channel: "email" });
    }
    if (want("push") && r.recipient_user_id) {
      rows.push({ ...base, channel: "push" });
    }
  }
  if (rows.length === 0) return [];
  const { data, error } = await svc
    .from("safety_message")
    .upsert(rows, {
      onConflict: "recipient_id,purpose,channel",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) throw new Error(`safety outbox write failed: ${error.message}`);
  return (data ?? []).map((r) => r.id);
}

/**
 * "I'm safe" / "That was a mistake": the people who were told get the
 * follow-up on the channels that reached them, and anything about the alert
 * that has not gone yet is called off.
 */
export async function queueFollowUp(
  svc: ServiceRoleClient,
  session: Pick<SessionRow, "id" | "user_id">,
  purpose: "safe" | "false_alarm",
): Promise<number[]> {
  const recipients = await loadRecipients(svc, session.id);
  if (recipients.length === 0) return [];
  const ids = recipients.map((r) => r.id);
  await svc
    .from("safety_message")
    .update({ status: "skipped", last_error: "resolved before sending" })
    .in("recipient_id", ids)
    .in("purpose", ["alert", "check_in_missed", "share", "event_team"])
    .eq("status", "pending");
  const { data: told } = await svc
    .from("safety_message")
    .select("recipient_id, channel, purpose")
    .in("recipient_id", ids)
    .in("purpose", ["alert", "check_in_missed", "event_team"])
    .in("status", ["sent", "sending"]);
  const channels = new Map<string, Set<SafetyChannel>>();
  for (const m of told ?? []) {
    if (!m.recipient_id) continue;
    const set = channels.get(m.recipient_id) ?? new Set<SafetyChannel>();
    set.add(m.channel as SafetyChannel);
    channels.set(m.recipient_id, set);
  }
  if (channels.size === 0) return [];
  return queueSessionMessages(svc, {
    session,
    purpose,
    recipients: recipients.filter((r) => channels.has(r.id)),
    allowSms: true,
    channels,
  });
}

/** Queues the invite text (and email) for a contact's current round. */
export async function queueInvite(
  svc: ServiceRoleClient,
  contact: ContactRow,
  allowSms: boolean,
): Promise<number[]> {
  const rows: {
    user_id: string;
    contact_id: string;
    invite_round: number;
    purpose: "invite";
    channel: SafetyChannel;
  }[] = [];
  const base = {
    user_id: contact.user_id,
    contact_id: contact.id,
    invite_round: contact.invite_count,
    purpose: "invite" as const,
  };
  if (allowSms && (await canTextNumber(contact.phone_e164))) {
    rows.push({ ...base, channel: "sms" });
  }
  if (contact.email) rows.push({ ...base, channel: "email" });
  if (rows.length === 0) return [];
  const { data, error } = await svc
    .from("safety_message")
    .upsert(rows, {
      onConflict: "contact_id,channel,invite_round",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) throw new Error(`safety invite write failed: ${error.message}`);
  return (data ?? []).map((r) => r.id);
}

// ── Sending ──────────────────────────────────────────────────────────

type Outcome =
  | { status: "sent"; providerId?: string | null }
  | { status: "failed" | "skipped"; error: string }
  | { status: "retry"; error: string };

export type SendSummary = {
  sent: number;
  failed: number;
  retrying: number;
  skipped: number;
};

type Loaded = {
  recipients: Map<string, SafetyRecipientRow>;
  contacts: Map<string, ContactRow>;
  sessions: Map<string, SessionRow>;
  people: Map<string, SafetyPerson>;
  events: Map<string, string>;
};

async function loadContext(
  svc: ServiceRoleClient,
  messages: MessageRow[],
): Promise<Loaded> {
  const recipientIds = [
    ...new Set(
      messages.map((m) => m.recipient_id).filter((x): x is string => !!x),
    ),
  ];
  const contactIds = [
    ...new Set(
      messages.map((m) => m.contact_id).filter((x): x is string => !!x),
    ),
  ];
  const [{ data: recipients }, { data: contacts }] = await Promise.all([
    recipientIds.length
      ? svc.from("safety_recipient").select("*").in("id", recipientIds)
      : Promise.resolve({ data: [] as SafetyRecipientRow[] }),
    contactIds.length
      ? svc.from("safety_contact").select("*").in("id", contactIds)
      : Promise.resolve({ data: [] as ContactRow[] }),
  ]);
  const sessionIds = [...new Set((recipients ?? []).map((r) => r.session_id))];
  const { data: sessions } = sessionIds.length
    ? await svc.from("safety_session").select("*").in("id", sessionIds)
    : { data: [] as SessionRow[] };
  const eventIds = [
    ...new Set(
      (sessions ?? []).map((s) => s.event_id).filter((x): x is string => !!x),
    ),
  ];
  const { data: events } = eventIds.length
    ? await svc.from("event").select("id, title").in("id", eventIds)
    : { data: [] as { id: string; title: string }[] };
  const userIds = [...new Set(messages.map((m) => m.user_id))];
  const people = new Map<string, SafetyPerson>();
  await Promise.all(
    userIds.map(async (id) => people.set(id, await loadSafetyPerson(svc, id))),
  );
  return {
    recipients: new Map((recipients ?? []).map((r) => [r.id, r])),
    contacts: new Map((contacts ?? []).map((c) => [c.id, c])),
    sessions: new Map((sessions ?? []).map((s) => [s.id, s])),
    people,
    events: new Map((events ?? []).map((e) => [e.id, e.title])),
  };
}

async function deliver(
  svc: ServiceRoleClient,
  m: MessageRow,
  ctx: Loaded,
  deps: SafetyDeps,
): Promise<Outcome> {
  const purpose = m.purpose as SafetyMessagePurpose;
  const channel = m.channel as SafetyChannel;
  const person = ctx.people.get(m.user_id);
  if (!person) return { status: "failed", error: "person not found" };
  const recipient = m.recipient_id ? ctx.recipients.get(m.recipient_id) : null;
  const contact = m.contact_id ? ctx.contacts.get(m.contact_id) : null;
  if (!recipient && !contact) {
    return { status: "skipped", error: "recipient no longer exists" };
  }
  const session = recipient ? ctx.sessions.get(recipient.session_id) : null;
  if (recipient && !session)
    return { status: "skipped", error: "session gone" };
  if (contact && contact.status === "declined") {
    return { status: "skipped", error: "contact declined" };
  }

  const locale = recipient?.locale ?? contact?.locale ?? "en";
  const phone = recipient?.phone_e164 ?? contact?.phone_e164 ?? null;
  const email = recipient?.email ?? contact?.email ?? null;
  const link = recipient
    ? viewUrlFor(recipient.id)
    : inviteUrlFor(m.contact_id as string);
  const timeAt =
    purpose === "share"
      ? session?.ends_at
      : purpose === "check_in_missed"
        ? session?.due_at
        : null;
  let emergency: string | null = null;
  if ((purpose === "alert" || purpose === "check_in_missed") && session) {
    const market = await getMarketOrDefault(session.country_code);
    // A contact abroad cannot dial another country's 112, so only a contact
    // in the same country as the person is told the number.
    if (!phone || phoneCountry(phone) === market.countryCode) {
      emergency =
        primaryEmergencyNumber(market.emergencyNumbers)?.number ?? null;
    }
  }
  const personName = person.name ?? "";
  const words = {
    person: personName,
    phone: person.phoneE164 ? formatPhoneInternational(person.phoneE164) : null,
    link,
    time: timeAt ? safetyClockTime(timeAt, locale, person.timezone) : null,
    emergency,
    eventTitle: session?.event_id
      ? (ctx.events.get(session.event_id) ?? null)
      : null,
  };

  if (channel === "sms") {
    if (!phone) return { status: "skipped", error: "no phone" };
    const blocked = await optedOutPhones(svc, m.user_id, [phone]);
    if (blocked.has(phone)) return { status: "skipped", error: "opted out" };
    const content = safetySmsText(purpose, locale, words);
    if (!content) return { status: "skipped", error: "not a text" };
    const sent = await sendHubtelSms({
      toE164: phone,
      content,
      clientReference: `sfy-${m.id}-${m.attempts}`,
    });
    if (sent.ok) return { status: "sent", providerId: sent.messageId };
    if (sent.reason === "not_configured") {
      return { status: "failed", error: sent.detail };
    }
    return { status: "retry", error: sent.detail };
  }

  if (channel === "email") {
    if (!email) return { status: "skipped", error: "no email" };
    if (!deps.sendEmail) {
      return { status: "retry", error: "no email sender in this request" };
    }
    const emailWords = safetyEmailWords(purpose, locale, words);
    if (!emailWords) return { status: "skipped", error: "not an email" };
    const res = await deps.sendEmail({
      to: email,
      locale,
      ...emailWords,
      buttonUrl: link,
      urgent: URGENT.has(purpose),
      idempotencyKey: `safety-message-${m.id}`,
    });
    if (res.ok) return { status: "sent" };
    return res.retry
      ? { status: "retry", error: res.error }
      : { status: "failed", error: res.error };
  }

  // push (an Abonten account: a linked contact or the event team)
  const userId = recipient?.recipient_user_id;
  const noticeId = safetyNoticeFor(purpose);
  if (!userId || !noticeId || !recipient || !session) {
    return { status: "skipped", error: "no account to notify" };
  }
  const token = viewTokenFor(recipient.id);
  const res = await createNotificationCore(svc, {
    userId,
    type: noticeId,
    link: safetyViewPath(token),
    data: {
      kind: "safety",
      safetyRole: "watcher",
      safetyToken: token,
      sessionId: session.id,
    },
    notice: {
      id: noticeId,
      params: {
        name: personName,
        event: words.eventTitle,
        startsAt: timeAt ?? null,
        timezone: person.timezone,
      },
    },
    urgent: URGENT.has(purpose),
  });
  return res.status === 200
    ? { status: "sent" }
    : { status: "retry", error: res.message ?? "notification write failed" };
}

async function finish(
  svc: ServiceRoleClient,
  m: MessageRow,
  outcome: Outcome,
  summary: SendSummary,
): Promise<void> {
  const now = Date.now();
  let patch: Database["public"]["Tables"]["safety_message"]["Update"];
  if (outcome.status === "sent") {
    patch = {
      status: "sent",
      sent_at: new Date(now).toISOString(),
      provider_message_id: outcome.providerId ?? null,
      last_error: null,
      claimed_at: null,
    };
    summary.sent += 1;
  } else if (outcome.status === "retry") {
    const next = nextAttemptAt(m.attempts, now);
    if (next) {
      patch = {
        status: "pending",
        next_attempt_at: next.toISOString(),
        last_error: outcome.error.slice(0, 500),
        claimed_at: null,
      };
      summary.retrying += 1;
    } else {
      patch = {
        status: "failed",
        last_error: outcome.error.slice(0, 500),
        claimed_at: null,
      };
      summary.failed += 1;
      logger.error(
        `Safety ${m.channel} ${m.purpose} gave up after ${m.attempts} attempts (message ${m.id}): ${outcome.error}`,
      );
    }
  } else {
    patch = {
      status: outcome.status,
      last_error: outcome.error.slice(0, 500),
      claimed_at: null,
    };
    if (outcome.status === "failed") {
      summary.failed += 1;
      logger.error(
        `Safety ${m.channel} ${m.purpose} failed (message ${m.id}): ${outcome.error}`,
      );
    } else {
      summary.skipped += 1;
    }
  }
  const { error } = await svc
    .from("safety_message")
    .update(patch)
    .eq("id", m.id);
  if (error) logger.error(`safety outbox finish ${m.id}: ${error.message}`);
}

/**
 * Claims and sends outbox rows: exactly `ids` (the request that queued them)
 * or whatever is due (the dispatcher).
 */
export async function sendSafetyMessages(
  svc: ServiceRoleClient,
  options: { ids?: number[]; limit?: number },
  deps: SafetyDeps,
): Promise<SendSummary> {
  const summary: SendSummary = { sent: 0, failed: 0, retrying: 0, skipped: 0 };
  if (options.ids && options.ids.length === 0) return summary;
  const { data: claimed, error } = await svc.rpc("safety_claim_messages", {
    p_limit: options.limit ?? 100,
    p_ids: options.ids ?? undefined,
  });
  if (error) {
    logger.error(`safety_claim_messages failed: ${error.message}`);
    return summary;
  }
  const ids = (claimed ?? []) as number[];
  if (ids.length === 0) return summary;
  const { data: messages, error: readError } = await svc
    .from("safety_message")
    .select("*")
    .in("id", ids);
  if (readError || !messages) {
    logger.error(`safety outbox read failed: ${readError?.message}`);
    return summary;
  }
  const ctx = await loadContext(svc, messages);
  // Alerts first, then the rest, so a busy run never makes an SOS wait.
  const order = (m: MessageRow) =>
    URGENT.has(m.purpose as SafetyMessagePurpose) ? 0 : 1;
  const sorted = [...messages].sort(
    (a, b) => order(a) - order(b) || a.id - b.id,
  );
  await inBatches(sorted, async (m) => {
    let outcome: Outcome;
    try {
      outcome = await deliver(svc, m, ctx, deps);
    } catch (e) {
      outcome = {
        status: "retry",
        error: e instanceof Error ? e.message : String(e),
      };
    }
    await finish(svc, m, outcome, summary);
  });
  return summary;
}

/** A notice to the person themselves (someone opened the alert, time to check in…). */
export async function notifyPerson(
  svc: ServiceRoleClient,
  userId: string,
  notice: {
    id: string;
    params?: Record<string, string | number | boolean | null>;
  },
  options: { sessionId?: string; urgent?: boolean } = {},
): Promise<void> {
  try {
    await createNotificationCore(svc, {
      userId,
      type: notice.id,
      link: "/safety",
      data: {
        kind: "safety",
        safetyRole: "person",
        ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      },
      notice,
      urgent: options.urgent === true,
    });
  } catch (error) {
    logger.error(
      `safety notifyPerson(${notice.id}) failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
