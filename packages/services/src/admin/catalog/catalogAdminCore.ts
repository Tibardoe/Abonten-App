import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type {
  AdminContext,
  AdminNoteEntry,
  EventAdminDetail,
  EventAdminListItem,
  ModerationState,
  OrganizerDetail,
  OrganizerListItem,
  PlaceAdminDetail,
  PlaceAdminListItem,
  ReportListItem,
  UserAccountStatus,
} from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type AdminEnvelope, assertPermission } from "../adminContext";

// Read-only catalog views for the Admin Console (Phase 2): Events, Places,
// Organizers. No mutations here — a moderator acts on this content through
// the Content module / report workspace (applyModerationActionCore), and on
// the organizer's account through the Users module (setUserStatusCore).
// Sales figures are "issued tickets × list price"; the authoritative money
// view is the Finance module (Phase 3).

const STATUS_NAME: Record<number, UserAccountStatus> = {
  1: "Active",
  2: "Suspended",
  3: "Banned",
};

async function names(
  supabase: SupabaseClient<Database>,
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from("user_info")
    .select("id, full_name, username")
    .in("id", unique);
  const m = new Map<string, string>();
  for (const r of data ?? [])
    m.set(r.id, r.full_name || r.username || r.id.slice(0, 8));
  return m;
}

async function reportCounts(
  supabase: SupabaseClient<Database>,
  targetType: string,
  ids: string[],
): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (ids.length === 0) return m;
  const { data } = await supabase
    .from("report")
    .select("target_id")
    .eq("target_type", targetType)
    .in("target_id", ids);
  for (const r of data ?? [])
    m.set(r.target_id as string, (m.get(r.target_id as string) ?? 0) + 1);
  return m;
}

async function recentReportsFor(
  supabase: SupabaseClient<Database>,
  targetType: string,
  targetId: string,
): Promise<ReportListItem[]> {
  const { data } = await supabase
    .from("report")
    .select(
      "id, target_type, target_id, category, status, priority, source, assigned_to, created_at, updated_at",
    )
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: false })
    .limit(10);
  // Same DB-CHECK-constrained-text-vs-literal-union translation as
  // reportsAdminCore.ts's listReportsCore.
  return (data ?? []).map((r) => ({
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    category: r.category,
    status: r.status,
    priority: r.priority,
    source: r.source,
    assignedTo: r.assigned_to,
    assignedToName: null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    targetReportCount: 0,
  })) as unknown as ReportListItem[];
}

async function adminNotes(
  supabase: SupabaseClient<Database>,
  targetType: string,
  targetId: string,
): Promise<AdminNoteEntry[]> {
  const { data } = await supabase
    .from("admin_note")
    .select("id, author_id, body, created_at")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: true });
  const nm = await names(
    supabase,
    (data ?? []).map((n) => n.author_id),
  );
  return (data ?? []).map((n) => ({
    id: n.id,
    authorId: n.author_id,
    authorName: n.author_id ? (nm.get(n.author_id) ?? null) : null,
    body: n.body,
    createdAt: n.created_at,
  }));
}

async function ratingFor(
  supabase: SupabaseClient<Database>,
  table: "event_review" | "place_review",
  fkCol: "event_id" | "place_id",
  id: string,
): Promise<{ avg: number; count: number }> {
  // Branched (rather than a single .from(table)/.eq(fkCol,...) call) so
  // each arm resolves a single, literal table and column -- the typed
  // client can't narrow a query built from table name and column name
  // varying together. See useFavorites.ts (mobile) for the same reasoning.
  const { data } =
    table === "event_review"
      ? await supabase
          .from("event_review")
          .select("rating")
          .eq("event_id", id)
          .eq("status", "approved")
          .limit(5000)
      : await supabase
          .from("place_review")
          .select("rating")
          .eq("place_id", id)
          .eq("status", "approved")
          .limit(5000);
  const rows = (data ?? []) as { rating: number }[];
  if (rows.length === 0) return { avg: 0, count: 0 };
  const avg = rows.reduce((s, r) => s + (r.rating ?? 0), 0) / rows.length;
  return { avg: Number(avg.toFixed(2)), count: rows.length };
}

async function eventSales(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<{ ticketsSold: number; grossSales: number; currency: string }> {
  const { data: tts } = await supabase
    .from("ticket_type")
    .select("id, price, currency")
    .eq("event_id", eventId);
  let ticketsSold = 0;
  let grossSales = 0;
  let currency = "GHS";
  for (const tt of tts ?? []) {
    if (tt.currency) currency = tt.currency;
    const { count } = await supabase
      .from("ticket")
      .select("id", { count: "exact", head: true })
      .eq("ticket_type_id", tt.id)
      .not("status", "in", "(cancelled,canceled,refunded,void)");
    ticketsSold += count ?? 0;
    grossSales += (count ?? 0) * Number(tt.price ?? 0);
  }
  return { ticketsSold, grossSales, currency };
}

// ─────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────

export type ListEventsFilters = {
  status?: string;
  moderationState?: ModerationState | "actioned" | "any";
  organizerId?: string;
  search?: string;
  cursor?: string | null;
  pageSize?: number;
};

export async function listEventsCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  filters: ListEventsFilters = {},
): Promise<PaginatedResult<EventAdminListItem>> {
  try {
    assertPermission(ctx, "events.view");
  } catch (e) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: (e as Error).message,
    };
  }

  const pageSize = filters.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(filters.cursor);

  let query = supabase
    .from("event")
    .select(
      "id, title, event_code, status, moderation_state, organizer_id, starts_at, featured, created_at",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.organizerId)
    query = query.eq("organizer_id", filters.organizerId);
  if (filters.moderationState === "actioned")
    query = query.not("moderation_state", "is", null);
  else if (filters.moderationState && filters.moderationState !== "any")
    query = query.eq("moderation_state", filters.moderationState);
  if (filters.search?.trim()) {
    const s = filters.search.trim().replace(/[%,()]/g, "");
    query = query.ilike("title", `%${s}%`);
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    logger.error(`listEventsCore failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const rows = data ?? [];
  const [nm, rc] = await Promise.all([
    names(
      supabase,
      rows.map((r) => r.organizer_id),
    ),
    reportCounts(
      supabase,
      "event",
      rows.map((r) => r.id),
    ),
  ]);

  const mapped: EventAdminListItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    eventCode: r.event_code ?? null,
    status: r.status,
    moderationState: (r.moderation_state as ModerationState) ?? null,
    organizerId: r.organizer_id,
    organizerName: nm.get(r.organizer_id) ?? null,
    startsAt: r.starts_at ?? null,
    featured: !!r.featured,
    reportCount: rc.get(r.id) ?? 0,
    createdAt: r.created_at,
  }));

  const { page, hasNextPage } = splitPage(mapped, pageSize);
  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.createdAt),
          id: last.id,
        })
      : null;
  return { status: 200, data: page, nextCursor, hasNextPage };
}

export async function getEventDetailCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  eventId: string,
): Promise<AdminEnvelope<EventAdminDetail>> {
  try {
    assertPermission(ctx, "events.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data: e, error } = await supabase
    .from("event")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    logger.error(`getEventDetailCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!e) return { status: 404, message: "Event not found" };

  const [nm, sales, rating, recentReports, notes, rc] = await Promise.all([
    names(supabase, [e.organizer_id]),
    eventSales(supabase, eventId),
    ratingFor(supabase, "event_review", "event_id", eventId),
    recentReportsFor(supabase, "event", eventId),
    adminNotes(supabase, "event", eventId),
    reportCounts(supabase, "event", [eventId]),
  ]);

  return {
    status: 200,
    data: {
      id: e.id,
      title: e.title,
      eventCode: e.event_code ?? null,
      status: e.status,
      moderationState: (e.moderation_state as ModerationState) ?? null,
      organizerId: e.organizer_id,
      organizerName: nm.get(e.organizer_id) ?? null,
      startsAt: e.starts_at ?? null,
      featured: !!e.featured,
      reportCount: rc.get(eventId) ?? 0,
      createdAt: e.created_at,
      description: e.description ?? null,
      category: e.event_category ?? null,
      address:
        (e.address as unknown as string | Record<string, unknown> | null) ??
        null,
      capacity: e.capacity ?? null,
      placeId: e.place_id ?? null,
      ticketsSold: sales.ticketsSold,
      grossSales: sales.grossSales,
      currency: sales.currency,
      avgRating: rating.avg,
      reviewCount: rating.count,
      moderationReason: e.moderation_reason ?? null,
      recentReports,
      notes,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Places
// ─────────────────────────────────────────────────────────────

export type ListPlacesFilters = {
  status?: string;
  moderationState?: ModerationState | "actioned" | "any";
  ownerId?: string;
  claimed?: boolean;
  search?: string;
  cursor?: string | null;
  pageSize?: number;
};

export async function listPlacesCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  filters: ListPlacesFilters = {},
): Promise<PaginatedResult<PlaceAdminListItem>> {
  try {
    assertPermission(ctx, "places.view");
  } catch (e) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: (e as Error).message,
    };
  }

  const pageSize = filters.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(filters.cursor);

  let query = supabase
    .from("place")
    .select(
      "id, name, slug, status, moderation_state, owner_id, claimed, verified, created_at",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.ownerId) query = query.eq("owner_id", filters.ownerId);
  if (typeof filters.claimed === "boolean")
    query = query.eq("claimed", filters.claimed);
  if (filters.moderationState === "actioned")
    query = query.not("moderation_state", "is", null);
  else if (filters.moderationState && filters.moderationState !== "any")
    query = query.eq("moderation_state", filters.moderationState);
  if (filters.search?.trim()) {
    const s = filters.search.trim().replace(/[%,()]/g, "");
    query = query.ilike("name", `%${s}%`);
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    logger.error(`listPlacesCore failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const rows = data ?? [];
  const [nm, rc] = await Promise.all([
    names(
      supabase,
      rows.map((r) => r.owner_id),
    ),
    reportCounts(
      supabase,
      "place",
      rows.map((r) => r.id),
    ),
  ]);

  const mapped: PlaceAdminListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug ?? null,
    status: r.status,
    moderationState: (r.moderation_state as ModerationState) ?? null,
    ownerId: r.owner_id ?? null,
    ownerName: r.owner_id ? (nm.get(r.owner_id) ?? null) : null,
    claimed: !!r.claimed,
    verified: !!r.verified,
    reportCount: rc.get(r.id) ?? 0,
    createdAt: r.created_at,
  }));

  const { page, hasNextPage } = splitPage(mapped, pageSize);
  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.createdAt),
          id: last.id,
        })
      : null;
  return { status: 200, data: page, nextCursor, hasNextPage };
}

export async function getPlaceDetailCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  placeId: string,
): Promise<AdminEnvelope<PlaceAdminDetail>> {
  try {
    assertPermission(ctx, "places.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data: p, error } = await supabase
    .from("place")
    .select("*")
    .eq("id", placeId)
    .maybeSingle();
  if (error) {
    logger.error(`getPlaceDetailCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!p) return { status: 404, message: "Place not found" };

  const [nm, rating, recentReports, notes, rc, upcoming, pendingClaims] =
    await Promise.all([
      names(supabase, [p.owner_id]),
      ratingFor(supabase, "place_review", "place_id", placeId),
      recentReportsFor(supabase, "place", placeId),
      adminNotes(supabase, "place", placeId),
      reportCounts(supabase, "place", [placeId]),
      supabase
        .from("event")
        .select("id", { count: "exact", head: true })
        .eq("place_id", placeId)
        .gte("starts_at", new Date().toISOString()),
      supabase
        .from("place_claim_request")
        .select("id", { count: "exact", head: true })
        .eq("place_id", placeId)
        .eq("status", "pending"),
    ]);

  return {
    status: 200,
    data: {
      id: p.id,
      name: p.name,
      slug: p.slug ?? null,
      status: p.status,
      moderationState: (p.moderation_state as ModerationState) ?? null,
      ownerId: p.owner_id ?? null,
      ownerName: p.owner_id ? (nm.get(p.owner_id) ?? null) : null,
      claimed: !!p.claimed,
      verified: !!p.verified,
      reportCount: rc.get(placeId) ?? 0,
      createdAt: p.created_at,
      description: p.description ?? null,
      address:
        (p.address as unknown as string | Record<string, unknown> | null) ??
        null,
      categoryId: p.category_id ?? null,
      avgRating: rating.avg,
      reviewCount: rating.count,
      upcomingEventCount: upcoming.count ?? 0,
      moderationReason: p.moderation_reason ?? null,
      pendingClaimCount: pendingClaims.count ?? 0,
      recentReports,
      notes,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Organizers (users with ≥1 event or ≥1 owned place)
// ─────────────────────────────────────────────────────────────

export type ListOrganizersFilters = {
  search?: string;
  cursor?: string | null;
  pageSize?: number;
};

export async function listOrganizersCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  filters: ListOrganizersFilters = {},
): Promise<PaginatedResult<OrganizerListItem>> {
  try {
    assertPermission(ctx, "organizers.view");
  } catch (e) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: (e as Error).message,
    };
  }

  const pageSize = filters.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(filters.cursor);

  // Distinct organizer ids come from event.organizer_id ∪ place.owner_id.
  // Both lists are bounded reads; we page the merged, de-duplicated set by
  // the user's created_at.
  const [{ data: evOrg }, { data: plOwn }] = await Promise.all([
    supabase.from("event").select("organizer_id").limit(20000),
    supabase.from("place").select("owner_id").limit(20000),
  ]);
  const ids = new Set<string>();
  for (const r of evOrg ?? []) if (r.organizer_id) ids.add(r.organizer_id);
  for (const r of plOwn ?? []) if (r.owner_id) ids.add(r.owner_id);
  if (ids.size === 0) {
    return {
      status: 200,
      data: [],
      nextCursor: null,
      hasNextPage: false,
    };
  }

  let query = supabase
    .from("user_info")
    .select("id, username, full_name, status_id, created_at")
    .in("id", [...ids])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (filters.search?.trim()) {
    const s = filters.search.trim().replace(/[%,()]/g, "");
    query = query.or(`username.ilike.%${s}%,full_name.ilike.%${s}%`);
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    logger.error(`listOrganizersCore failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const rows = data ?? [];
  const mapped: OrganizerListItem[] = await Promise.all(
    rows.map(async (u) => {
      const [ev, pl, rep] = await Promise.all([
        supabase
          .from("event")
          .select("id", { count: "exact", head: true })
          .eq("organizer_id", u.id),
        supabase
          .from("place")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", u.id),
        supabase
          .from("report")
          .select("id", { count: "exact", head: true })
          .in("target_type", ["organizer", "user"])
          .eq("target_id", u.id),
      ]);
      return {
        id: u.id,
        username: u.username ?? null,
        fullName: u.full_name ?? null,
        accountStatus: STATUS_NAME[u.status_id as number] ?? "Active",
        eventCount: ev.count ?? 0,
        placeCount: pl.count ?? 0,
        ticketsSold: 0,
        reportsAgainst: rep.count ?? 0,
        createdAt: u.created_at ?? null,
      };
    }),
  );

  const { page, hasNextPage } = splitPage(mapped, pageSize);
  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.createdAt),
          id: last.id,
        })
      : null;
  return { status: 200, data: page, nextCursor, hasNextPage };
}

export async function getOrganizerDetailCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  organizerId: string,
): Promise<AdminEnvelope<OrganizerDetail>> {
  try {
    assertPermission(ctx, "organizers.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data: u, error } = await supabase
    .from("user_info")
    .select("id, username, full_name, bio, status_id, is_admin, created_at")
    .eq("id", organizerId)
    .maybeSingle();
  if (error) {
    logger.error(`getOrganizerDetailCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!u) return { status: 404, message: "User not found" };

  const canPii = ctx.permissions.includes("users.view_pii");
  let email: string | null = null;
  if (canPii) {
    const { data: au } = await supabase.auth.admin.getUserById(organizerId);
    email = au?.user?.email ?? null;
  }

  const [
    { data: evRows },
    { data: plRows },
    recentReportsAgainst,
    notes,
    { count: reportsAgainst },
    { count: hiddenContent },
  ] = await Promise.all([
    supabase
      .from("event")
      .select(
        "id, title, event_code, status, moderation_state, organizer_id, starts_at, featured, created_at",
      )
      .eq("organizer_id", organizerId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("place")
      .select(
        "id, name, slug, status, moderation_state, owner_id, claimed, verified, created_at",
      )
      .eq("owner_id", organizerId)
      .order("created_at", { ascending: false })
      .limit(25),
    recentReportsFor(supabase, "organizer", organizerId),
    adminNotes(supabase, "organizer", organizerId),
    supabase
      .from("report")
      .select("id", { count: "exact", head: true })
      .in("target_type", ["organizer", "user"])
      .eq("target_id", organizerId),
    supabase
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", organizerId)
      .in("moderation_state", ["hidden", "removed"]),
  ]);

  const [{ count: eventCount }, { count: placeCount }] = await Promise.all([
    supabase
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", organizerId),
    supabase
      .from("place")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", organizerId),
  ]);

  // Organizer-as-a-person rating lives in the generic `review` table.
  const { data: orgReviews } = await supabase
    .from("review")
    .select("rating")
    .eq("reviewed_id", organizerId)
    .eq("status", "approved")
    .limit(5000);
  const orgRatingRows = (orgReviews ?? []) as { rating: number }[];
  const avgOrganizerRating =
    orgRatingRows.length > 0
      ? Number(
          (
            orgRatingRows.reduce((s, r) => s + (r.rating ?? 0), 0) /
            orgRatingRows.length
          ).toFixed(2),
        )
      : 0;

  let grossSales = 0;
  let ticketsSold = 0;
  let currency = "GHS";
  for (const ev of evRows ?? []) {
    const s = await eventSales(supabase, ev.id);
    grossSales += s.grossSales;
    ticketsSold += s.ticketsSold;
    if (s.currency) currency = s.currency;
  }

  const recentEvents: EventAdminListItem[] = (evRows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    eventCode: r.event_code ?? null,
    status: r.status,
    moderationState: (r.moderation_state as ModerationState) ?? null,
    organizerId: r.organizer_id,
    organizerName: u.full_name || u.username || null,
    startsAt: r.starts_at ?? null,
    featured: !!r.featured,
    reportCount: 0,
    createdAt: r.created_at,
  }));

  const places: PlaceAdminListItem[] = (plRows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug ?? null,
    status: r.status,
    moderationState: (r.moderation_state as ModerationState) ?? null,
    ownerId: r.owner_id ?? null,
    ownerName: u.full_name || u.username || null,
    claimed: !!r.claimed,
    verified: !!r.verified,
    reportCount: 0,
    createdAt: r.created_at,
  }));

  return {
    status: 200,
    data: {
      id: u.id,
      username: u.username ?? null,
      fullName: u.full_name ?? null,
      bio: u.bio ?? null,
      accountStatus: STATUS_NAME[u.status_id as number] ?? "Active",
      isAdmin: !!u.is_admin,
      email,
      createdAt: u.created_at ?? null,
      stats: {
        events: eventCount ?? 0,
        places: placeCount ?? 0,
        ticketsSold,
        grossSales,
        currency,
        avgOrganizerRating,
        organizerRatingCount: orgRatingRows.length,
        reportsAgainst: reportsAgainst ?? 0,
        hiddenOrRemovedContent: hiddenContent ?? 0,
      },
      recentEvents,
      places,
      recentReportsAgainst,
      notes,
    },
  };
}
