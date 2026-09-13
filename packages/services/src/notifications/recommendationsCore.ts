import { logger } from "@abonten/core/logger";
import type {
  RecommendationItem,
  RecommendationReason,
} from "@abonten/types/discoveryType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { resolveDiscoveryAccess } from "../search/discoveryProgram";

// The person-facing side of the recommendation engine: the "For you" list
// (live picks from the last 30 days that are still worth showing), "Not
// interested", and open/click tracking when a recommendation notice or card
// is tapped. Shadow rows are never shown to anyone.

type Envelope<T> = {
  status: 200 | 400 | 401 | 403 | 500;
  message?: string;
  data?: T;
};

function reasonLabel(
  reason: RecommendationReason,
  basis: Record<string, unknown>,
  names: { organizer?: string | null; place?: string | null },
): string {
  switch (reason) {
    case "organizer":
      return names.organizer
        ? `New from @${names.organizer}`
        : "From an organizer you follow";
    case "place":
      return names.place ? `At ${names.place}` : "At a place you follow";
    case "similar_events":
      return typeof basis.category === "string"
        ? `Because you like ${basis.category}`
        : "Similar to events you liked";
    case "similar_places":
      return "Similar to places you liked";
  }
}

export async function listRecommendationsCore(
  service: ServiceRoleClient,
  userId: string,
): Promise<Envelope<RecommendationItem[]>> {
  if (!userId) return { status: 401, message: "Please sign in first." };
  const { program } = await resolveDiscoveryAccess(service, userId);
  if (!program.personalization) return { status: 200, data: [] };

  const { data, error } = await service.rpc("recommendations_for_user", {
    p_user: userId,
    p_limit: 30,
  });
  if (error) {
    logger.error(`recommendations_for_user failed: ${error.message}`);
    return { status: 500, message: "Couldn't load your picks." };
  }
  const rows = data ?? [];
  const eventIds = rows
    .filter((r) => r.subject_type === "event")
    .map((r) => r.subject_id);
  const placeIds = rows
    .filter((r) => r.subject_type === "place")
    .map((r) => r.subject_id);

  const [events, places] = await Promise.all([
    eventIds.length
      ? service
          .from("event")
          .select(
            "id, title, event_code, starts_at, flyer_public_id, flyer_version, address, event_category, place_id, event_occurrence(starts_at, ends_at), user_info!organizer_id(username), place(name)",
          )
          .in("id", eventIds)
      : Promise.resolve({ data: [], error: null }),
    placeIds.length
      ? service
          .from("place")
          .select(
            "id, name, slug, cover_public_id, cover_version, address, place_category(name)",
          )
          .in("id", placeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (events.error || places.error) {
    logger.error(
      `recommendations hydrate failed: ${events.error?.message ?? places.error?.message}`,
    );
    return { status: 500, message: "Couldn't load your picks." };
  }

  type EventRow = {
    id: string;
    title: string;
    event_code: string;
    starts_at: string | null;
    flyer_public_id: string | null;
    flyer_version: string | null;
    address: { full_address?: string } | null;
    event_category: string | null;
    event_occurrence: { starts_at: string; ends_at: string }[] | null;
    user_info: { username: string | null } | null;
    place: { name: string | null } | null;
  };
  type PlaceRow = {
    id: string;
    name: string | null;
    slug: string | null;
    cover_public_id: string | null;
    cover_version: string | null;
    address: { full_address?: string } | null;
    place_category: { name: string } | null;
  };
  const eventById = new Map(
    ((events.data ?? []) as unknown as EventRow[]).map((e) => [e.id, e]),
  );
  const placeById = new Map(
    ((places.data ?? []) as unknown as PlaceRow[]).map((p) => [p.id, p]),
  );
  const now = Date.now();

  const items: RecommendationItem[] = [];
  for (const r of rows) {
    const basis = (r.basis ?? {}) as Record<string, unknown>;
    const reason = r.reason_kind as RecommendationReason;
    if (r.subject_type === "event") {
      const e = eventById.get(r.subject_id);
      if (!e) continue;
      const nextStart =
        (e.event_occurrence ?? [])
          .filter((o) => new Date(o.ends_at).getTime() > now)
          .map((o) => o.starts_at)
          .sort()[0] ?? e.starts_at;
      items.push({
        id: r.recommendation_id,
        subjectType: "event",
        subjectId: r.subject_id,
        reason,
        reasonLabel: reasonLabel(reason, basis, {
          organizer: e.user_info?.username,
          place: e.place?.name,
        }),
        createdAt: r.created_at,
        event: {
          id: e.id,
          title: e.title,
          eventCode: e.event_code,
          startsAt: nextStart,
          flyerPublicId: e.flyer_public_id,
          flyerVersion: e.flyer_version,
          address: e.address?.full_address ?? null,
          category: e.event_category,
        },
        place: null,
      });
    } else {
      const p = placeById.get(r.subject_id);
      if (!p?.slug) continue;
      items.push({
        id: r.recommendation_id,
        subjectType: "place",
        subjectId: r.subject_id,
        reason,
        reasonLabel: reasonLabel(reason, basis, {}),
        createdAt: r.created_at,
        event: null,
        place: {
          id: p.id,
          name: p.name ?? "A place",
          slug: p.slug,
          coverPublicId: p.cover_public_id,
          coverVersion: p.cover_version,
          address: p.address?.full_address ?? null,
          category: p.place_category?.name ?? null,
        },
      });
    }
  }
  return { status: 200, data: items };
}

export async function dismissRecommendationCore(
  service: ServiceRoleClient,
  userId: string,
  input: { subjectType: "event" | "place"; subjectId: string },
): Promise<Envelope<{ dismissed: boolean; paused: boolean }>> {
  if (!userId) return { status: 401, message: "Please sign in first." };
  const { data, error } = await service.rpc("recommendation_dismiss", {
    p_user: userId,
    p_subject_type: input.subjectType,
    p_subject_id: input.subjectId,
  });
  if (error) {
    logger.error(`recommendation_dismiss failed: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }
  const result = (data ?? {}) as { dismissed?: boolean; paused?: boolean };
  return {
    status: 200,
    message: result.paused
      ? "Got it. We've paused these picks for a while."
      : "Got it. We'll show fewer picks like this.",
    data: { dismissed: !!result.dismissed, paused: !!result.paused },
  };
}

/** A tap on a recommendation notice or a For-you card. Never fails the caller. */
export async function markRecommendationOpenedCore(
  service: ServiceRoleClient,
  userId: string,
  input: {
    notificationId?: string | null;
    subjectType?: "event" | "place" | null;
    subjectId?: string | null;
  },
): Promise<void> {
  if (!userId) return;
  const { error } = await service.rpc("recommendation_mark_opened", {
    p_user: userId,
    // Nullable in SQL (a For-you card tap has no notification); the
    // generated Args type marks every parameter without a DEFAULT required.
    p_notification_id: (input.notificationId ?? null) as string,
    p_subject_type: input.subjectType ?? undefined,
    p_subject_id: input.subjectId ?? undefined,
  });
  if (error) {
    logger.error(`recommendation_mark_opened failed: ${error.message}`);
  }
}
