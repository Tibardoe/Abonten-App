import { useSession } from "@/auth/SessionProvider";
import { favoritesListKey } from "@/features/favorites/useFavorites";
import { withEventAttendanceCounts } from "@/lib/eventAttendance";
import { supabase } from "@/lib/supabase";
import {
  type PlaceOpeningHourRow,
  computePlaceOpenStatus,
} from "@abonten/core/computePlaceOpenStatus";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import { useInfiniteQuery } from "@tanstack/react-query";

// The Places / favourite-places tabs render the full PlaceCard, but the list
// comes from a plain `place` table read (no is_open / rating from a list
// RPC). This derives the two card fields client-side from the joined
// opening-hours + approved review rows so the card isn't stuck showing
// "Closed" / "No reviews" for every place.
function enrichPlaceRow(
  row: PlaceType & {
    place_category?: { name: string; slug: string } | null;
    place_opening_hours?: PlaceOpeningHourRow[] | null;
    place_review?: { rating: number; status?: string | null }[] | null;
  },
): ProfilePlace {
  const approved = (row.place_review ?? []).filter(
    (r) => r.status == null || r.status === "approved",
  );
  const reviewCount = approved.length;
  const avgRating =
    reviewCount > 0
      ? approved.reduce((s, r) => s + (r.rating ?? 0), 0) / reviewCount
      : 0;
  const open = computePlaceOpenStatus(
    row.place_opening_hours ?? [],
    row.temporary_status ?? null,
  );
  return {
    ...row,
    category_name: row.place_category?.name ?? row.category_name ?? null,
    avg_rating: avgRating,
    review_count: reviewCount,
    is_open: open.isOpen,
  } as ProfilePlace;
}

// Data for the public-profile tabs — native echoes of the web
// user/[username]/{posts,places,favorites,reviews} pages. Direct table
// reads: `event` / `place` are anon-readable; `favorite` / `favorite_place`
// are RLS-scoped to the viewer (so the Favourites tab only has rows on the
// viewer's OWN profile — same constraint as the web pages, which use the
// viewer's session); `review` is anon-readable.

const PAGE = 12;

type Cursor = { createdAt: string; id: string } | null;

function minPrice(tickets: { price: number; currency: string }[] | null) {
  if (!tickets || tickets.length === 0) return { min_price: 0, currency: "" };
  const cheapest = tickets.reduce((m, t) => (t.price < m.price ? t : m));
  return { min_price: cheapest.price, currency: cheapest.currency };
}

// ---- Events (organizer's own events) --------------------------------------
export function useProfileEvents(userId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["profile", "events", userId],
    enabled: !!userId,
    initialPageParam: null as Cursor,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("event")
        .select(
          "*, ticket_type(price, currency), event_occurrence(id, starts_at, ends_at)",
        )
        .eq("organizer_id", userId as string)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE + 1);
      if (pageParam) {
        q = q.or(
          `created_at.lt.${pageParam.createdAt},and(created_at.eq.${pageParam.createdAt},id.lt.${pageParam.id})`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      const all = (data ?? []) as (UserPostType & {
        ticket_type: { price: number; currency: string }[] | null;
        created_at: string;
      })[];
      const hasNext = all.length > PAGE;
      const page = (hasNext ? all.slice(0, PAGE) : all).map((e) => ({
        ...e,
        ...minPrice(e.ticket_type),
        occurrences: e.event_occurrence ?? e.occurrences,
      })) as UserPostType[];
      const last = all[page.length - 1];
      // Raw `event` read carries no attendance — backfill so the profile
      // Events tab cards match every other EventCard surface.
      const rows = await withEventAttendanceCounts(page);
      return {
        rows,
        nextCursor:
          hasNext && last
            ? { createdAt: String(last.created_at), id: last.id }
            : null,
      };
    },
    getNextPageParam: (p) => p.nextCursor,
  });
}

// ---- Places (owned) -----------------------------------------------------
export type ProfilePlace = PlaceType & {
  place_category?: { name: string; slug: string } | null;
  created_at: string;
};

export function useProfilePlaces(userId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["profile", "places", userId],
    enabled: !!userId,
    initialPageParam: null as Cursor,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("place")
        .select(
          "*, place_category(name, slug), place_opening_hours(day_of_week, open_time, close_time, is_closed), place_review(rating, status)",
        )
        .eq("owner_id", userId as string)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE + 1);
      if (pageParam) {
        q = q.or(
          `created_at.lt.${pageParam.createdAt},and(created_at.eq.${pageParam.createdAt},id.lt.${pageParam.id})`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      // biome-ignore lint/suspicious/noExplicitAny: PostgREST embeds aren't in the generated PlaceType
      const all = ((data ?? []) as any[]).map(enrichPlaceRow);
      const hasNext = all.length > PAGE;
      const rows = hasNext ? all.slice(0, PAGE) : all;
      const last = rows[rows.length - 1];
      return {
        rows,
        nextCursor:
          hasNext && last
            ? { createdAt: String(last.created_at), id: last.id }
            : null,
      };
    },
    getNextPageParam: (p) => p.nextCursor,
  });
}

// ---- Favourites (viewer's own only, due to RLS) ------------------------
export function useProfileFavoriteEvents(active: boolean) {
  const { session } = useSession();
  return useInfiniteQuery({
    queryKey: [...favoritesListKey("event"), "list"],
    enabled: active && !!session,
    initialPageParam: null as Cursor,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("favorite")
        .select(
          "created_at, event_id, event(*, ticket_type(price, currency), event_occurrence(id, starts_at, ends_at))",
        )
        .order("created_at", { ascending: false })
        .limit(PAGE + 1);
      if (pageParam) q = q.lt("created_at", pageParam.createdAt);
      const { data, error } = await q;
      if (error) throw error;
      const all = (data ?? []) as unknown as {
        created_at: string;
        event_id: string;
        event:
          | (UserPostType & {
              ticket_type: { price: number; currency: string }[] | null;
            })
          | null;
      }[];
      const hasNext = all.length > PAGE;
      const slice = hasNext ? all.slice(0, PAGE) : all;
      const rows = slice
        .filter((r) => r.event)
        .map((r) => {
          const e = r.event as UserPostType & {
            ticket_type: { price: number; currency: string }[] | null;
          };
          return {
            ...e,
            ...minPrice(e.ticket_type),
            occurrences: e.event_occurrence ?? e.occurrences,
          } as UserPostType;
        });
      const last = slice[slice.length - 1];
      return {
        rows,
        nextCursor:
          hasNext && last
            ? { createdAt: String(last.created_at), id: last.event_id }
            : null,
      };
    },
    getNextPageParam: (p) => p.nextCursor,
  });
}

export function useProfileFavoritePlaces(active: boolean) {
  const { session } = useSession();
  return useInfiniteQuery({
    queryKey: [...favoritesListKey("place"), "list"],
    enabled: active && !!session,
    initialPageParam: null as Cursor,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("favorite_place")
        .select(
          "created_at, place_id, place(*, place_category(name, slug), place_opening_hours(day_of_week, open_time, close_time, is_closed), place_review(rating, status))",
        )
        .order("created_at", { ascending: false })
        .limit(PAGE + 1);
      if (pageParam) q = q.lt("created_at", pageParam.createdAt);
      const { data, error } = await q;
      if (error) throw error;
      const all = (data ?? []) as unknown as {
        created_at: string;
        place_id: string;
        // biome-ignore lint/suspicious/noExplicitAny: PostgREST embeds aren't in the generated PlaceType
        place: any | null;
      }[];
      const hasNext = all.length > PAGE;
      const slice = hasNext ? all.slice(0, PAGE) : all;
      const rows = slice
        .filter((r) => r.place)
        .map((r) => enrichPlaceRow(r.place));
      const last = slice[slice.length - 1];
      return {
        rows,
        nextCursor:
          hasNext && last
            ? { createdAt: String(last.created_at), id: last.place_id }
            : null,
      };
    },
    getNextPageParam: (p) => p.nextCursor,
  });
}

// ---- Reviews (received about this user) --------------------------------
export type ProfileReview = {
  id: string;
  rating: number;
  title: string;
  comment: string | null;
  created_at: string;
  reviewer: { username: string | null } | null;
  // Only set for owned-place reviews (the "Place Reviews" sub-tab).
  place?: { name: string | null } | null;
};

export function useProfileReviews(userId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["profile", "reviews", userId],
    enabled: !!userId,
    initialPageParam: null as Cursor,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("review")
        .select(
          "id, rating, title, comment, created_at, reviewer:reviewer_id(username)",
        )
        .eq("reviewed_id", userId as string)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE + 1);
      if (pageParam) {
        q = q.or(
          `created_at.lt.${pageParam.createdAt},and(created_at.eq.${pageParam.createdAt},id.lt.${pageParam.id})`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      const all = (data ?? []) as unknown as ProfileReview[];
      const hasNext = all.length > PAGE;
      const rows = hasNext ? all.slice(0, PAGE) : all;
      const last = rows[rows.length - 1];
      return {
        rows,
        nextCursor:
          hasNext && last
            ? { createdAt: String(last.created_at), id: last.id }
            : null,
      };
    },
    getNextPageParam: (p) => p.nextCursor,
  });
}

// ---- Reviews of places this user owns (the "Place Reviews" sub-tab) -----
// Native echo of the web getOwnedPlaceReviews action: place_review has no
// "reviewed person" column, so filter by joining to `place` and matching
// its owner_id. `place_review` is anon-readable where status='approved'
// (place_review_public_select), same as `review`.
export function useProfilePlaceReviews(userId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["profile", "place-reviews", userId],
    enabled: !!userId,
    initialPageParam: null as Cursor,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("place_review")
        .select(
          "id, rating, title, comment, created_at, reviewer:reviewer_id(username), place:place_id!inner(name, owner_id)",
        )
        .eq("place.owner_id", userId as string)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE + 1);
      if (pageParam) {
        q = q.or(
          `created_at.lt.${pageParam.createdAt},and(created_at.eq.${pageParam.createdAt},id.lt.${pageParam.id})`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      const all = (data ?? []) as unknown as ProfileReview[];
      const hasNext = all.length > PAGE;
      const rows = hasNext ? all.slice(0, PAGE) : all;
      const last = rows[rows.length - 1];
      return {
        rows,
        nextCursor:
          hasNext && last
            ? { createdAt: String(last.created_at), id: last.id }
            : null,
      };
    },
    getNextPageParam: (p) => p.nextCursor,
  });
}
