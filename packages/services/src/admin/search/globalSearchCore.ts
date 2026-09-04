import { logger } from "@abonten/core/logger";
import type {
  AdminContext,
  GlobalSearchHit,
  GlobalSearchResults,
} from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type AdminEnvelope, assertPermission } from "../adminContext";

// One search box for the whole console (Phase 5). Each group is only
// populated if the caller holds the matching view permission — you can only
// find what you're allowed to open. Read-only.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PER_GROUP = 8;

function sanitize(q: string): string {
  return q
    .trim()
    .replace(/[%,()]/g, "")
    .slice(0, 120);
}

export async function globalSearchCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  input: { q: string },
): Promise<AdminEnvelope<GlobalSearchResults>> {
  // any authenticated admin may search; each group is permission-gated below
  try {
    assertPermission(ctx, "dashboard.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const q = sanitize(input.q);
  const empty: GlobalSearchResults = {
    query: q,
    users: [],
    events: [],
    places: [],
    transactions: [],
    reports: [],
  };
  if (q.length < 2) return { status: 200, data: empty };

  const isId = UUID_RE.test(q);
  const like = `%${q}%`;
  const can = (p: Parameters<typeof assertPermission>[1]) =>
    ctx.permissions.includes(p);

  const results: GlobalSearchResults = { ...empty };

  await Promise.all([
    (async () => {
      if (!can("users.view")) return;
      let query = supabase
        .from("user_info")
        .select("id, username, full_name, status_id, is_admin")
        .limit(PER_GROUP);
      query = isId
        ? query.eq("id", q)
        : query.or(`username.ilike.${like},full_name.ilike.${like}`);
      const { data, error } = await query;
      if (error) {
        logger.error(`globalSearch users failed: ${error.message}`);
        return;
      }
      results.users = (data ?? []).map(
        (u): GlobalSearchHit => ({
          id: u.id,
          label: u.full_name || u.username || `${u.id.slice(0, 8)}…`,
          sublabel: u.is_admin ? "staff" : (u.username ?? null),
          href: `/users/${u.id}`,
        }),
      );
    })(),

    (async () => {
      if (!can("events.view")) return;
      let query = supabase
        .from("event")
        .select("id, title, event_code, status")
        .limit(PER_GROUP);
      query = isId
        ? query.eq("id", q)
        : query.or(`title.ilike.${like},event_code.ilike.${like}`);
      const { data, error } = await query;
      if (error) {
        logger.error(`globalSearch events failed: ${error.message}`);
        return;
      }
      results.events = (data ?? []).map(
        (e): GlobalSearchHit => ({
          id: e.id,
          label: e.title,
          sublabel: `${e.event_code ?? e.id.slice(0, 8)} · ${e.status}`,
          href: `/events/${e.id}`,
        }),
      );
    })(),

    (async () => {
      if (!can("places.view")) return;
      let query = supabase
        .from("place")
        .select("id, name, slug, status")
        .limit(PER_GROUP);
      query = isId
        ? query.eq("id", q)
        : query.or(`name.ilike.${like},slug.ilike.${like}`);
      const { data, error } = await query;
      if (error) {
        logger.error(`globalSearch places failed: ${error.message}`);
        return;
      }
      results.places = (data ?? []).map(
        (p): GlobalSearchHit => ({
          id: p.id,
          label: p.name,
          sublabel: p.slug ? `/${p.slug} · ${p.status}` : p.status,
          href: `/places/${p.id}`,
        }),
      );
    })(),

    (async () => {
      if (!can("transactions.view")) return;
      let query = supabase
        .from("transaction")
        .select(
          "id, paystack_reference, full_name, email, amount, currency, status",
        )
        .limit(PER_GROUP);
      query = isId
        ? query.eq("id", q)
        : query.or(
            `paystack_reference.ilike.${like},email.ilike.${like},full_name.ilike.${like}`,
          );
      const { data, error } = await query;
      if (error) {
        logger.error(`globalSearch transactions failed: ${error.message}`);
        return;
      }
      results.transactions = (data ?? []).map(
        (t): GlobalSearchHit => ({
          id: t.id,
          label: t.paystack_reference ?? `${t.id.slice(0, 8)}…`,
          sublabel: `${t.full_name ?? "—"} · ${t.currency ?? ""} ${t.amount ?? ""} · ${t.status}`,
          href: `/finance/transactions/${t.id}`,
        }),
      );
    })(),

    (async () => {
      if (!can("reports.view")) return;
      let query = supabase
        .from("report")
        .select("id, target_type, target_id, category, status")
        .order("created_at", { ascending: false })
        .limit(PER_GROUP);
      query = isId
        ? query.or(`id.eq.${q},target_id.eq.${q}`)
        : query.ilike("details", like);
      const { data, error } = await query;
      if (error) {
        logger.error(`globalSearch reports failed: ${error.message}`);
        return;
      }
      results.reports = (data ?? []).map(
        (r): GlobalSearchHit => ({
          id: r.id,
          label: `${r.target_type} · ${r.category}`,
          sublabel: `${r.status} · target ${String(r.target_id).slice(0, 8)}…`,
          href: `/reports/${r.id}`,
        }),
      );
    })(),
  ]);

  return { status: 200, data: results };
}
