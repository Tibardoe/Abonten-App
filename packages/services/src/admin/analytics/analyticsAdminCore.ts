import { logger } from "@abonten/core/logger";
import type {
  AdminContext,
  AnalyticsSeriesPoint,
  DashboardRange,
  PlatformAnalytics,
} from "@abonten/types/adminTypes";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type AdminEnvelope, assertPermission } from "../adminContext";

// Platform Analytics (Phase 4) — read-only aggregates. Abonten operates in
// Ghana (Africa/Accra = UTC+0), so UTC day boundaries are local. Totals use
// head-count queries; the daily series buckets raw created_at columns in JS
// (capped) rather than N per-day round trips.

const SERIES_ROW_CAP = 50_000;

function resolveRange(
  range: DashboardRange,
  from?: string,
  to?: string,
): { from: string; to: string } {
  const now = new Date();
  if (range === "custom" && from && to) return { from, to };
  const iso = now.toISOString();
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 86_400_000).toISOString();
  switch (range) {
    case "today":
      return {
        from: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        ).toISOString(),
        to: iso,
      };
    case "7d":
      return { from: daysAgo(7), to: iso };
    case "90d":
      return { from: daysAgo(90), to: iso };
    default:
      return { from: daysAgo(30), to: iso };
  }
}

const dayKey = (iso: string) => iso.slice(0, 10);

function num(v: unknown): number {
  const n = typeof v === "string" ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

async function headCount(
  supabase: SupabaseClient,
  table: string,
  // biome-ignore lint/suspicious/noExplicitAny: PostgREST builder chaining not worth typing
  build?: (q: any) => any,
): Promise<number> {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  if (build) q = build(q);
  const { count, error } = await q;
  if (error) {
    logger.error(`analytics headCount(${table}) failed: ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

export async function getPlatformAnalyticsCore(
  supabase: SupabaseClient,
  ctx: AdminContext,
  opts: { range: DashboardRange; from?: string; to?: string },
): Promise<AdminEnvelope<PlatformAnalytics>> {
  try {
    assertPermission(ctx, "analytics.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { from, to } = resolveRange(opts.range, opts.from, opts.to);

  // ── all-time totals ──────────────────────────────────────
  const [
    users,
    places,
    eventsTotal,
    eventsPublished,
    ticketsAllTime,
    { data: feeAll },
    { data: cfg },
  ] = await Promise.all([
    headCount(supabase, "user_info"),
    headCount(supabase, "place"),
    headCount(supabase, "event"),
    headCount(supabase, "event", (q) => q.eq("status", "published")),
    headCount(supabase, "ticket"),
    supabase
      .from("platform_fee_entry")
      .select("total_customer_payment, net_revenue, currency")
      .limit(SERIES_ROW_CAP),
    supabase
      .from("platform_fee_config")
      .select("currency")
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  let currency = cfg?.currency ?? "GHS";
  let grossAllTime = 0;
  let netAllTime = 0;
  for (const f of feeAll ?? []) {
    if (f.currency) currency = f.currency;
    grossAllTime += num(f.total_customer_payment);
    netAllTime += num(f.net_revenue);
  }

  // organizers = distinct users who organize an event OR own a place
  const [{ data: evOrg }, { data: plOwn }] = await Promise.all([
    supabase
      .from("event")
      .select("organizer_id, created_at")
      .limit(SERIES_ROW_CAP),
    supabase.from("place").select("owner_id, created_at").limit(SERIES_ROW_CAP),
  ]);
  const organizerIds = new Set<string>();
  for (const r of evOrg ?? [])
    if (r.organizer_id) organizerIds.add(r.organizer_id);
  for (const r of plOwn ?? []) if (r.owner_id) organizerIds.add(r.owner_id);

  // ── in-range raw rows for the series ─────────────────────
  const [
    { data: uRows },
    { data: eRows },
    { data: pRows },
    { data: tRows },
    { data: feeRange },
  ] = await Promise.all([
    supabase
      .from("user_info")
      .select("created_at")
      .gte("created_at", from)
      .lte("created_at", to)
      .limit(SERIES_ROW_CAP),
    supabase
      .from("event")
      .select("id, title, organizer_id, created_at")
      .gte("created_at", from)
      .lte("created_at", to)
      .limit(SERIES_ROW_CAP),
    supabase
      .from("place")
      .select("created_at")
      .gte("created_at", from)
      .lte("created_at", to)
      .limit(SERIES_ROW_CAP),
    supabase
      .from("ticket")
      .select("created_at, ticket_type_id")
      .gte("created_at", from)
      .lte("created_at", to)
      .limit(SERIES_ROW_CAP),
    supabase
      .from("platform_fee_entry")
      .select("total_customer_payment, net_revenue, event_id, created_at")
      .gte("created_at", from)
      .lte("created_at", to)
      .limit(SERIES_ROW_CAP),
  ]);

  // bucket by UTC day
  const buckets = new Map<string, AnalyticsSeriesPoint>();
  const bump = (
    key: string,
    field: keyof Omit<AnalyticsSeriesPoint, "date">,
    by = 1,
  ) => {
    const b =
      buckets.get(key) ??
      ({
        date: key,
        newUsers: 0,
        newEvents: 0,
        newPlaces: 0,
        ticketsIssued: 0,
        grossRevenue: 0,
      } satisfies AnalyticsSeriesPoint);
    (b[field] as number) += by;
    buckets.set(key, b);
  };
  for (const r of uRows ?? []) bump(dayKey(r.created_at), "newUsers");
  for (const r of eRows ?? []) bump(dayKey(r.created_at), "newEvents");
  for (const r of pRows ?? []) bump(dayKey(r.created_at), "newPlaces");
  for (const r of tRows ?? []) bump(dayKey(r.created_at), "ticketsIssued");
  for (const r of feeRange ?? [])
    bump(dayKey(r.created_at), "grossRevenue", num(r.total_customer_payment));

  const series = [...buckets.values()].sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );

  const grossRange = (feeRange ?? []).reduce(
    (s, f) => s + num(f.total_customer_payment),
    0,
  );
  const netRange = (feeRange ?? []).reduce((s, f) => s + num(f.net_revenue), 0);
  const activeOrganizers = new Set(
    (eRows ?? []).map((e) => e.organizer_id).filter(Boolean),
  ).size;

  // ── top events (by tickets issued in range) ─────────────
  const ttToEvent = new Map<string, string>();
  const eventTitles = new Map<string, string>();
  for (const e of eRows ?? []) eventTitles.set(e.id, e.title);
  const inRangeTicketTypeIds = [
    ...new Set(
      (tRows ?? [])
        .map((t) => t.ticket_type_id as string)
        .filter((x): x is string => !!x),
    ),
  ];
  if (inRangeTicketTypeIds.length > 0) {
    const { data: tt } = await supabase
      .from("ticket_type")
      .select("id, event_id")
      .in("id", inRangeTicketTypeIds);
    for (const r of tt ?? []) ttToEvent.set(r.id, r.event_id);
  }
  const ticketsByEvent = new Map<string, number>();
  for (const t of tRows ?? []) {
    const ev = ttToEvent.get(t.ticket_type_id as string);
    if (ev) ticketsByEvent.set(ev, (ticketsByEvent.get(ev) ?? 0) + 1);
  }
  const topEventIds = [...ticketsByEvent.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  // resolve titles/organizers for any top events not in the in-range set
  const needTitles = topEventIds
    .map(([id]) => id)
    .filter((id) => !eventTitles.has(id));
  const orgByEvent = new Map<string, string>();
  for (const e of eRows ?? [])
    if (e.organizer_id) orgByEvent.set(e.id, e.organizer_id);
  if (needTitles.length > 0) {
    const { data: ev2 } = await supabase
      .from("event")
      .select("id, title, organizer_id")
      .in("id", needTitles);
    for (const e of ev2 ?? []) {
      eventTitles.set(e.id, e.title);
      if (e.organizer_id) orgByEvent.set(e.id, e.organizer_id);
    }
  }

  // ── top organizers (by gross in range) ──────────────────
  const grossByEvent = new Map<string, number>();
  for (const f of feeRange ?? [])
    if (f.event_id)
      grossByEvent.set(
        f.event_id,
        (grossByEvent.get(f.event_id) ?? 0) + num(f.total_customer_payment),
      );
  // need organizer for every event with gross
  const grossEventIds = [...grossByEvent.keys()];
  const missingOrg = grossEventIds.filter((id) => !orgByEvent.has(id));
  if (missingOrg.length > 0) {
    const { data: ev3 } = await supabase
      .from("event")
      .select("id, organizer_id")
      .in("id", missingOrg);
    for (const e of ev3 ?? [])
      if (e.organizer_id) orgByEvent.set(e.id, e.organizer_id);
  }
  const grossByOrg = new Map<string, number>();
  for (const [evId, g] of grossByEvent) {
    const org = orgByEvent.get(evId);
    if (org) grossByOrg.set(org, (grossByOrg.get(org) ?? 0) + g);
  }
  const topOrgIds = [...grossByOrg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // resolve names for everyone we mention
  const nameIds = [
    ...new Set([
      ...topEventIds.map(([id]) => orgByEvent.get(id)).filter(Boolean),
      ...topOrgIds.map(([id]) => id),
    ]),
  ] as string[];
  const names = new Map<string, string>();
  if (nameIds.length > 0) {
    const { data: us } = await supabase
      .from("user_info")
      .select("id, full_name, username")
      .in("id", nameIds);
    for (const u of us ?? [])
      names.set(u.id, u.full_name || u.username || u.id.slice(0, 8));
  }

  return {
    status: 200,
    data: {
      range: opts.range,
      from,
      to,
      currency,
      totals: {
        users,
        organizers: organizerIds.size,
        eventsPublished,
        eventsTotal,
        places,
        ticketsIssuedAllTime: ticketsAllTime,
        grossCustomerPaymentsAllTime: grossAllTime,
        netPlatformRevenueAllTime: netAllTime,
      },
      inRange: {
        newUsers: (uRows ?? []).length,
        newEvents: (eRows ?? []).length,
        newPlaces: (pRows ?? []).length,
        ticketsIssued: (tRows ?? []).length,
        grossRevenue: grossRange,
        netPlatformRevenue: netRange,
        activeOrganizers,
      },
      series,
      topEvents: topEventIds.map(([id, tickets]) => ({
        id,
        title: eventTitles.get(id) ?? `${id.slice(0, 8)}…`,
        organizerName: (() => {
          const org = orgByEvent.get(id);
          return org ? (names.get(org) ?? null) : null;
        })(),
        ticketsIssued: tickets,
      })),
      topOrganizers: topOrgIds.map(([id, gross]) => ({
        id,
        name: names.get(id) ?? null,
        grossRevenue: gross,
        currency,
      })),
    },
  };
}
