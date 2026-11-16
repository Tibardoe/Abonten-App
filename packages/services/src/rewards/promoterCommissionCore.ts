import { logger } from "@abonten/core/logger";
import { eventPath } from "@abonten/core/seo/paths";
import type { Database } from "@abonten/types/database.types";
import type {
  EventPromoter,
  EventPromoterCommission,
  EventPromoterOffer,
} from "@abonten/types/rewards";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";
import { createNotificationCore } from "../notifications/createNotification";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";
import { checkRateLimit } from "../security/rateLimit";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { recordTeamMoneyEventFor } from "../teams/teamMoney";
import { getRewardsProgramCore } from "./rewardsProgramQuery";

// Organizer-funded promoter commissions (Abonten Rewards Phase 8). The
// organizer offers a share of the ticket price on one event; whoever's
// referral link sells a ticket gets it as Abonten Credit after the event, and
// the same amount comes off the organizer's payout (the reward engine posts
// both -- _reward_evaluate_promoter_commission). Shared by the web Server
// Actions and /api/mobile/organizer/events/[id]/promoter-commission.
//
// Invited promoters (Part 7, first slice; X33, X36): the organizer can add
// promoters by username, each with their own rate if they like, and say only
// those earn. A member of the team that runs the event earns on it only when
// an Owner added them (the database sets event_promoter.owner_approved from
// who added the row). Migration 20261116230000_invited_promoters.
//
// `userId` is the account that runs the event: the person, or the team they
// manage as (Owners and Finance, promotions.buy; the transport checks the
// role). `personId` is who is signed in and changed it.

type Envelope<T> = {
  status: 200 | 400 | 401 | 403 | 404 | 409 | 429 | 500;
  message?: string;
  data?: T;
};

type StatsJson = {
  sales?: number;
  promoters?: number;
  revenue_minor?: number;
  pending_minor?: number;
  paid_minor?: number;
};

/** At most this many promoters on one event. */
export const MAX_EVENT_PROMOTERS = 100;

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

type OwnedEvent = {
  ok: true;
  status: string;
  currency: string;
  code: string | null;
  title: string;
};

async function ownedEvent(
  userId: string,
  eventId: string,
): Promise<
  OwnedEvent | { ok: false; status: 404 | 403 | 500; message: string }
> {
  const { data, error } = await getSupabaseServiceClient()
    .from("event")
    .select("organizer_id, status, currency, event_code, title")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    logger.error(`promoter commission: event read failed: ${error.message}`);
    return {
      ok: false,
      status: 500,
      message: tr("somethingWentWrong"),
    };
  }
  if (!data) return { ok: false, status: 404, message: tr("eventNotFound2") };
  if (data.organizer_id !== userId) {
    return {
      ok: false,
      status: 403,
      message: tr("onlyTheEventSOrganizerCan"),
    };
  }
  return {
    ok: true,
    status: String(data.status),
    currency: data.currency,
    code: data.event_code ?? null,
    title: data.title ?? "",
  };
}

type PromoterRow = {
  promoter_id: string;
  rate_bps: number | null;
  owner_approved: boolean;
  added_at: string;
};

type PersonRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_public_id: string | null;
  avatar_version: string | null;
};

/** The promoters on the list, with their names, team status and figures. */
async function promotersOf(
  organizerId: string,
  eventId: string,
): Promise<EventPromoter[] | null> {
  const service = getSupabaseServiceClient();
  const [rows, stats] = await Promise.all([
    service
      .from("event_promoter")
      .select("promoter_id, rate_bps, owner_approved, added_at")
      .eq("event_id", eventId)
      .is("removed_at", null)
      .order("added_at", { ascending: false })
      .limit(MAX_EVENT_PROMOTERS),
    service.rpc("promoter_commission_promoter_stats", { p_event_id: eventId }),
  ]);
  if (rows.error || stats.error) {
    logger.error(
      `promotersOf ${eventId}: ${rows.error?.message ?? stats.error?.message}`,
    );
    return null;
  }
  const list = (rows.data ?? []) as PromoterRow[];
  if (list.length === 0) return [];
  const ids = list.map((r) => r.promoter_id);
  const [people, members] = await Promise.all([
    service
      .from("user_info")
      .select("id, full_name, username, avatar_public_id, avatar_version")
      .in("id", ids),
    service
      .from("team_member")
      .select("user_id")
      .eq("team_id", organizerId)
      .eq("status", "active")
      .in("user_id", ids),
  ]);
  const byId = new Map(
    ((people.data ?? []) as PersonRow[]).map((p) => [p.id, p]),
  );
  const memberIds = new Set((members.data ?? []).map((m) => m.user_id));
  const figures = new Map(
    (stats.data ?? []).map((s) => [s.promoter_id, s] as const),
  );
  return list.map((r) => {
    const person = byId.get(r.promoter_id);
    const f = figures.get(r.promoter_id);
    return {
      userId: r.promoter_id,
      name: person?.full_name?.trim() || person?.username || "",
      username: person?.username ?? null,
      avatarPublicId: person?.avatar_public_id ?? null,
      avatarVersion: person?.avatar_version ?? null,
      rateBps: r.rate_bps,
      teamMember: memberIds.has(r.promoter_id),
      approved: r.owner_approved,
      addedAt: r.added_at,
      sales: num(f?.sales),
      pendingMinor: num(f?.pending_minor),
      paidMinor: num(f?.paid_minor),
    };
  });
}

/** The organizer's view of an event's promoter commission. */
export async function getEventPromoterCommissionCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  _personId: string = userId,
): Promise<Envelope<EventPromoterCommission>> {
  if (!userId) return { status: 401, message: tr("userNotLoggedIn") };
  if (!eventId) return { status: 400, message: tr("eventIsRequired") };

  const owned = await ownedEvent(userId, eventId);
  if (!owned.ok) return { status: owned.status, message: owned.message };

  const service = getSupabaseServiceClient();
  const [program, offer, stats, promoters] = await Promise.all([
    getRewardsProgramCore(supabase),
    service
      .from("event_promoter_commission")
      .select("rate_bps, is_active, invited_only")
      .eq("event_id", eventId)
      .maybeSingle(),
    service.rpc("promoter_commission_event_stats", { p_event_id: eventId }),
    promotersOf(userId, eventId),
  ]);
  if (program.status !== 200 || offer.error || stats.error || !promoters) {
    logger.error(
      `getEventPromoterCommissionCore failed for ${eventId}: ${
        offer.error?.message ??
        stats.error?.message ??
        program.message ??
        "promoters"
      }`,
    );
    return {
      status: 500,
      message: tr("couldnTLoadThePromoterCommission"),
    };
  }

  const terms = program.data.enabled ? program.data.promoterCommission : null;
  const s = (stats.data ?? {}) as StatsJson;
  return {
    status: 200,
    data: {
      currency: owned.currency,
      available: !!terms,
      rateBps: offer.data?.is_active ? offer.data.rate_bps : null,
      minRateBps: terms?.minRateBps ?? 100,
      maxRateBps: terms?.maxRateBps ?? 3000,
      stats: {
        sales: num(s.sales),
        promoters: num(s.promoters),
        revenueMinor: num(s.revenue_minor),
        pendingMinor: num(s.pending_minor),
        paidMinor: num(s.paid_minor),
      },
      invitedOnly: offer.data?.invited_only ?? false,
      promoters,
      maxPromoters: MAX_EVENT_PROMOTERS,
    },
  };
}

/** The live commission terms, or the envelope saying they aren't live. */
async function liveTerms(
  supabase: SupabaseClient<Database>,
): Promise<
  | { ok: true; minRateBps: number; maxRateBps: number }
  | { ok: false; status: 409; message: string }
> {
  const program = await getRewardsProgramCore(supabase);
  const terms = program.data.enabled ? program.data.promoterCommission : null;
  if (!terms) {
    return {
      ok: false,
      status: 409,
      message: tr("promoterCommissionsArenTAvailableYet"),
    };
  }
  return {
    ok: true,
    minRateBps: terms.minRateBps,
    maxRateBps: terms.maxRateBps,
  };
}

function rateProblem(
  rateBps: number,
  terms: { minRateBps: number; maxRateBps: number },
): string | null {
  if (
    !Number.isFinite(rateBps) ||
    rateBps < terms.minRateBps ||
    rateBps > terms.maxRateBps
  ) {
    return tr("chooseACommissionBetweenAnd", {
      min: terms.minRateBps / 100,
      max: terms.maxRateBps / 100,
    });
  }
  return null;
}

/**
 * Sets (rateBps) or stops (null) the commission on one of the caller's
 * events, and whether only invited promoters earn (X33). A change applies
 * to tickets sold from now on; sales already made keep the rate they were
 * sold at.
 */
export async function setEventPromoterCommissionCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { eventId: string; rateBps: number | null; invitedOnly?: boolean },
  personId: string = userId,
): Promise<Envelope<EventPromoterCommission>> {
  if (!userId) return { status: 401, message: tr("userNotLoggedIn") };
  if (!input?.eventId) return { status: 400, message: tr("eventIsRequired") };
  if (
    input.invitedOnly !== undefined &&
    typeof input.invitedOnly !== "boolean"
  ) {
    return { status: 400, message: tr("invalidRequest2") };
  }

  const allowed = await checkRateLimit(
    `promoter-commission:${personId}`,
    20,
    3600,
  );
  if (!allowed) {
    return {
      status: 429,
      message: tr("tooManyChangesTryAgainIn"),
    };
  }

  const owned = await ownedEvent(userId, input.eventId);
  if (!owned.ok) return { status: owned.status, message: owned.message };

  const service = getSupabaseServiceClient();

  if (input.rateBps === null) {
    const { error } = await service
      .from("event_promoter_commission")
      .update({
        is_active: false,
        updated_by: personId,
        updated_at: new Date().toISOString(),
      })
      .eq("event_id", input.eventId);
    if (error) {
      logger.error(`Stopping promoter commission failed: ${error.message}`);
      return { status: 500, message: tr("couldnTStopTheCommission") };
    }
    await recordCommissionChange(userId, personId, input.eventId, null);
    return getEventPromoterCommissionCore(supabase, userId, input.eventId);
  }

  if (owned.status === "canceled" || owned.status === "completed") {
    return {
      status: 409,
      message: tr("thisEventIsnTSellingTickets"),
    };
  }

  const terms = await liveTerms(supabase);
  if (!terms.ok) return { status: terms.status, message: terms.message };

  const rate = Math.round(Number(input.rateBps));
  const problem = rateProblem(rate, terms);
  if (problem) return { status: 400, message: problem };

  const { data: before } = await service
    .from("event_promoter_commission")
    .select("invited_only")
    .eq("event_id", input.eventId)
    .maybeSingle();
  const { error } = await service.from("event_promoter_commission").upsert(
    {
      event_id: input.eventId,
      rate_bps: rate,
      is_active: true,
      ...(input.invitedOnly !== undefined
        ? { invited_only: input.invitedOnly }
        : {}),
      updated_by: personId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id" },
  );
  if (error) {
    logger.error(`Saving promoter commission failed: ${error.message}`);
    return { status: 500, message: tr("couldnTSaveTheCommission") };
  }
  const invitedChanged =
    input.invitedOnly !== undefined &&
    input.invitedOnly !== (before?.invited_only ?? false);
  await recordCommissionChange(
    userId,
    personId,
    input.eventId,
    rate,
    invitedChanged ? input.invitedOnly : undefined,
  );
  return getEventPromoterCommissionCore(supabase, userId, input.eventId);
}

/** A team's activity names who changed what its event pays promoters. */
async function recordCommissionChange(
  accountId: string,
  personId: string,
  eventId: string,
  rateBps: number | null,
  invitedOnly?: boolean,
): Promise<void> {
  if (accountId === personId) return;
  await recordTeamMoneyEventFor(
    getSupabaseServiceClient(),
    accountId,
    personId,
    {
      kind: "promoter_commission_changed",
      eventId,
      rateBps,
      invitedOnly,
    },
  );
}

/** The person with this username, if it is an active person's account. */
async function personByUsername(username: string): Promise<PersonRow | null> {
  const handle = username.trim().replace(/^@+/, "");
  if (!/^[A-Za-z0-9_]{1,40}$/.test(handle)) return null;
  const { data, error } = await getSupabaseServiceClient()
    .from("user_info")
    .select("id, full_name, username, avatar_public_id, avatar_version")
    .ilike("username", handle)
    .eq("status_id", 1)
    .eq("account_kind", "person")
    .maybeSingle();
  if (error) logger.error(`promoter personByUsername: ${error.message}`);
  return (data as PersonRow | null) ?? null;
}

/** The person is an active member of the team `teamId` (false for a person). */
async function memberRole(
  teamId: string,
  personId: string,
): Promise<string | null> {
  const { data } = await getSupabaseServiceClient()
    .from("team_member")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", personId)
    .eq("status", "active")
    .maybeSingle();
  return data?.role ?? null;
}

/**
 * Adds a promoter to one of the caller's events by username (or changes
 * the rate of one already on the list). `rateBps` null = the event's rate.
 * A member of the team that runs the event may be added only by an Owner
 * (X36). The commission must be on: the person is told what they earn.
 */
export async function addEventPromoterCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { eventId: string; username: string; rateBps: number | null },
  personId: string = userId,
): Promise<Envelope<EventPromoterCommission>> {
  if (!userId) return { status: 401, message: tr("userNotLoggedIn") };
  if (
    !input?.eventId ||
    typeof input.username !== "string" ||
    (input.rateBps !== null && typeof input.rateBps !== "number")
  ) {
    return { status: 400, message: tr("invalidRequest2") };
  }
  const allowed = await checkRateLimit(`promoter-list:${personId}`, 60, 3600);
  if (!allowed) {
    return { status: 429, message: tr("tooManyChangesTryAgainIn") };
  }

  const owned = await ownedEvent(userId, input.eventId);
  if (!owned.ok) return { status: owned.status, message: owned.message };
  if (owned.status === "canceled" || owned.status === "completed") {
    return { status: 409, message: tr("thisEventIsnTSellingTickets") };
  }
  const terms = await liveTerms(supabase);
  if (!terms.ok) return { status: terms.status, message: terms.message };

  const service = getSupabaseServiceClient();
  const { data: offer } = await service
    .from("event_promoter_commission")
    .select("rate_bps, is_active")
    .eq("event_id", input.eventId)
    .maybeSingle();
  if (!offer?.is_active) {
    return { status: 409, message: tr("promoterOfferFirst") };
  }

  let rate: number | null = null;
  if (input.rateBps !== null) {
    rate = Math.round(Number(input.rateBps));
    const problem = rateProblem(rate, terms);
    if (problem) return { status: 400, message: problem };
  }

  const person = await personByUsername(input.username);
  if (!person) return { status: 404, message: tr("teamAccountNotFound") };
  if (person.id === userId) {
    return { status: 409, message: tr("promoterOwnEvent") };
  }
  if (await isAccountRestricted(person.id)) {
    return { status: 409, message: tr("promoterRestricted") };
  }
  if (await isAccountRestricted(personId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }

  // X36: only an Owner may let a member of the team earn on its events.
  // (The database records whether an Owner added the row, and the reward
  // rule pays a member only then.)
  if (userId !== personId) {
    const promoterIsMember = (await memberRole(userId, person.id)) !== null;
    if (promoterIsMember && (await memberRole(userId, personId)) !== "owner") {
      return { status: 403, message: tr("promoterMemberOwnerOnly") };
    }
  }

  const { data: existing } = await service
    .from("event_promoter")
    .select("removed_at, rate_bps")
    .eq("event_id", input.eventId)
    .eq("promoter_id", person.id)
    .maybeSingle();
  const isNew = !existing || existing.removed_at !== null;
  const changed = isNew || existing?.rate_bps !== rate;
  if (isNew) {
    const { count } = await service
      .from("event_promoter")
      .select("promoter_id", { count: "exact", head: true })
      .eq("event_id", input.eventId)
      .is("removed_at", null);
    if ((count ?? 0) >= MAX_EVENT_PROMOTERS) {
      return {
        status: 409,
        message: tr("promoterTooMany", { max: MAX_EVENT_PROMOTERS }),
      };
    }
  }

  const now = new Date().toISOString();
  const { error } = await service.from("event_promoter").upsert(
    {
      event_id: input.eventId,
      promoter_id: person.id,
      rate_bps: rate,
      added_by: personId,
      ...(isNew ? { added_at: now } : {}),
      removed_at: null,
      removed_by: null,
    },
    { onConflict: "event_id,promoter_id" },
  );
  if (error) {
    logger.error(`addEventPromoterCore: ${error.message}`);
    return { status: 500, message: tr("couldnTSaveThePromoter") };
  }

  // The team's activity: a new promoter, or a new rate for one.
  if (userId !== personId && changed) {
    await recordTeamMoneyEventFor(service, userId, personId, {
      kind: "promoter_added",
      eventId: input.eventId,
      promoterId: person.id,
      rateBps: rate,
    });
  }
  if (isNew) {
    await noticePromoter(
      person.id,
      "promoter_added",
      userId,
      input.eventId,
      owned,
      { pct: (rate ?? offer.rate_bps) / 100 },
    );
  }
  return getEventPromoterCommissionCore(supabase, userId, input.eventId);
}

/**
 * Takes a promoter off one of the caller's events. Sales through their link
 * from now on earn nothing extra; what they already earned stays theirs.
 */
export async function removeEventPromoterCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { eventId: string; promoterId: string },
  personId: string = userId,
): Promise<Envelope<EventPromoterCommission>> {
  if (!userId) return { status: 401, message: tr("userNotLoggedIn") };
  if (!input?.eventId || typeof input.promoterId !== "string") {
    return { status: 400, message: tr("invalidRequest2") };
  }
  const allowed = await checkRateLimit(`promoter-list:${personId}`, 60, 3600);
  if (!allowed) {
    return { status: 429, message: tr("tooManyChangesTryAgainIn") };
  }
  const owned = await ownedEvent(userId, input.eventId);
  if (!owned.ok) return { status: owned.status, message: owned.message };

  const service = getSupabaseServiceClient();
  const { data, error } = await service
    .from("event_promoter")
    .update({ removed_at: new Date().toISOString(), removed_by: personId })
    .eq("event_id", input.eventId)
    .eq("promoter_id", input.promoterId)
    .is("removed_at", null)
    .select("promoter_id");
  if (error) {
    logger.error(`removeEventPromoterCore: ${error.message}`);
    return { status: 500, message: tr("couldnTSaveThePromoter") };
  }
  if (!data?.length) {
    return { status: 404, message: tr("promoterNotOnList") };
  }
  if (userId !== personId) {
    await recordTeamMoneyEventFor(service, userId, personId, {
      kind: "promoter_removed",
      eventId: input.eventId,
      promoterId: input.promoterId,
    });
  }
  await noticePromoter(
    input.promoterId,
    "promoter_removed",
    userId,
    input.eventId,
    owned,
  );
  return getEventPromoterCommissionCore(supabase, userId, input.eventId);
}

/** Tells the promoter, in their language. Best-effort. */
async function noticePromoter(
  promoterId: string,
  id: "promoter_added" | "promoter_removed",
  organizerId: string,
  eventId: string,
  event: OwnedEvent,
  extra: Record<string, number> = {},
): Promise<void> {
  const service = getSupabaseServiceClient();
  const { data: organizer } = await service
    .from("user_info")
    .select("full_name, username, avatar_public_id, avatar_version")
    .eq("id", organizerId)
    .maybeSingle();
  await createNotificationCore(service, {
    userId: promoterId,
    type: id,
    notice: {
      id,
      params: {
        actor: organizer?.full_name?.trim() || organizer?.username || "",
        event: event.title,
        ...extra,
      },
    },
    link: event.code ? eventPath(event.code) : null,
    data: { kind: "event", eventId },
    imagePublicId: organizer?.avatar_public_id ?? null,
    imageVersion: organizer?.avatar_version ?? null,
  }).catch((e) => logger.error(`noticePromoter ${id}: ${e}`));
}

/**
 * What a sharer earns on an event (the "share and earn" note): their own
 * rate if the organizer added them, else the event's -- or null when
 * commissions aren't live, the event offers none, it pays invited promoters
 * only and they aren't one, or they run the event. A member of the
 * organizer's team earns only when an Owner added them (X36); the organizer
 * never does. Reads with the service role: the list is private, and an
 * invited-only offer is hidden from the public row.
 */
export async function getEventPromoterOfferCore(
  supabase: SupabaseClient<Database>,
  eventId: string,
  viewerId: string | null = null,
): Promise<{ status: 200 | 400 | 500; data?: EventPromoterOffer | null }> {
  if (!eventId) return { status: 400 };
  const service = getSupabaseServiceClient();
  const [program, offer, event, listing] = await Promise.all([
    getRewardsProgramCore(supabase),
    service
      .from("event_promoter_commission")
      .select("rate_bps, invited_only")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .maybeSingle(),
    service
      .from("event")
      .select("organizer_id, status, ends_at")
      .eq("id", eventId)
      .maybeSingle(),
    viewerId
      ? service
          .from("event_promoter")
          .select("rate_bps, owner_approved")
          .eq("event_id", eventId)
          .eq("promoter_id", viewerId)
          .is("removed_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (offer.error || event.error || listing.error) {
    logger.error(
      `getEventPromoterOfferCore failed: ${
        offer.error?.message ?? event.error?.message ?? listing.error?.message
      }`,
    );
    return { status: 500 };
  }
  const terms = program.data.enabled ? program.data.promoterCommission : null;
  if (!terms || !offer.data) return { status: 200, data: null };
  // Nothing more to sell: an ended, completed or cancelled event.
  const status = String(event.data?.status ?? "");
  const endsAt = event.data?.ends_at ? Date.parse(event.data.ends_at) : null;
  if (
    status === "canceled" ||
    status === "completed" ||
    (endsAt !== null && endsAt < Date.now())
  ) {
    return { status: 200, data: null };
  }

  const organizerId = event.data?.organizer_id ?? null;
  const listed = listing.data;
  if (viewerId && organizerId) {
    if (viewerId === organizerId) return { status: 200, data: null };
    const { data: member } = await service.rpc("is_team_member", {
      p_team_id: organizerId,
      p_user_id: viewerId,
    });
    if (member === true && !listed?.owner_approved) {
      return { status: 200, data: null };
    }
  }
  if (offer.data.invited_only && !listed) return { status: 200, data: null };

  const rate = listed?.rate_bps ?? offer.data.rate_bps;
  return {
    status: 200,
    data: {
      rateBps: Math.min(Math.max(rate, terms.minRateBps), terms.maxRateBps),
      invited: !!listed,
    },
  };
}
