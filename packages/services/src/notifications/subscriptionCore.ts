import { logger } from "@abonten/core/logger";
import { parseWKBHex } from "@abonten/core/parseWKBHex";
import type {
  NotificationSubscription,
  SubscriptionKind,
  SubscriptionSource,
  SubscriptionStatusResult,
  SubscriptionTarget,
} from "@abonten/types/discoveryType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { resolveDiscoveryAccess } from "../search/discoveryProgram";
import { checkRateLimit } from "../security/rateLimit";

// Explicit, revocable interest subscriptions: "Notify me" on an organizer,
// updates from a place, similar events or similar places nearby. Nothing
// here runs without the person asking: the transports call it from a
// "Notify me" button, an accepted opt-in prompt or the preference centre.
//
// The table has no client write grants. Every write goes through here on the
// service role after the transport proved identity: the target must exist
// and be public, the topic (category + point) is taken from the event or
// place itself, never from the client, and changes are rate-limited.

type Envelope<T> = {
  status: 200 | 400 | 401 | 403 | 404 | 409 | 429 | 500;
  message?: string;
  data?: T;
};

const VISIBLE_MODERATION =
  "moderation_state.is.null,moderation_state.not.in.(hidden,removed)";
const MAX_CHANGES_PER_HOUR = 30;

export const SUBSCRIPTION_KINDS: SubscriptionKind[] = [
  "organizer",
  "place",
  "similar_events",
  "similar_places",
];

/** "Oxford Street, Osu, Accra, Ghana" -> "Accra". */
export function localityFromAddress(
  full: string | null | undefined,
): string | null {
  if (!full) return null;
  const parts = full
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !/^ghana$/i.test(p) && !/^\d[\d\s-]*$/.test(p));
  return parts.length ? parts[parts.length - 1] : null;
}

function addressText(address: unknown): string | null {
  if (address && typeof address === "object" && "full_address" in address) {
    const value = (address as { full_address?: unknown }).full_address;
    return typeof value === "string" ? value : null;
  }
  return null;
}

function pointFrom(location: unknown): { lat: number; lng: number } | null {
  if (typeof location !== "string" || location.length < 42) return null;
  try {
    const { eventLat, eventLng } = parseWKBHex(location);
    if (!Number.isFinite(eventLat) || !Number.isFinite(eventLng)) return null;
    return { lat: eventLat, lng: eventLng };
  } catch {
    return null;
  }
}

async function guard(
  service: ServiceRoleClient,
  userId: string,
): Promise<Envelope<never> | null> {
  if (!userId) return { status: 401, message: "Please sign in first." };
  const { program } = await resolveDiscoveryAccess(service, userId);
  if (!program.personalization) {
    return { status: 403, message: "Alerts aren't available yet." };
  }
  return null;
}

type ResolvedTarget = {
  kind: SubscriptionKind;
  targetId: string | null;
  topicCategory: string | null;
  point: { lat: number; lng: number } | null;
  sourceEventId: string | null;
  sourcePlaceId: string | null;
};

async function resolveTarget(
  service: ServiceRoleClient,
  userId: string,
  target: SubscriptionTarget,
): Promise<Envelope<ResolvedTarget>> {
  switch (target.kind) {
    case "organizer": {
      if (target.organizerId === userId) {
        return { status: 400, message: "You can't follow yourself." };
      }
      const { data: organizer } = await service
        .from("user_info")
        .select("id, status_id")
        .eq("id", target.organizerId)
        .maybeSingle();
      if (!organizer || organizer.status_id !== 1) {
        return { status: 404, message: "Organizer not found." };
      }
      const [events, places] = await Promise.all([
        service
          .from("event")
          .select("id", { count: "exact", head: true })
          .eq("organizer_id", target.organizerId)
          .eq("status", "published")
          .is("archived_at", null)
          .or(VISIBLE_MODERATION),
        service
          .from("place")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", target.organizerId)
          .eq("status", "published")
          .or(VISIBLE_MODERATION),
      ]);
      if ((events.count ?? 0) === 0 && (places.count ?? 0) === 0) {
        return {
          status: 404,
          message: "This account has nothing to follow yet.",
        };
      }
      return {
        status: 200,
        data: {
          kind: "organizer",
          targetId: target.organizerId,
          topicCategory: null,
          point: null,
          sourceEventId: null,
          sourcePlaceId: null,
        },
      };
    }
    case "place":
    case "similar_places": {
      const { data: place } = await service
        .from("place")
        .select(
          "id, owner_id, status, moderation_state, location, place_category(slug)",
        )
        .eq("id", target.placeId)
        .maybeSingle();
      if (
        !place ||
        place.status !== "published" ||
        place.moderation_state === "hidden" ||
        place.moderation_state === "removed"
      ) {
        return { status: 404, message: "Place not found." };
      }
      if (place.owner_id === userId) {
        return { status: 400, message: "This is your own place." };
      }
      if (target.kind === "place") {
        return {
          status: 200,
          data: {
            kind: "place",
            targetId: place.id,
            topicCategory: null,
            point: null,
            sourceEventId: null,
            sourcePlaceId: place.id,
          },
        };
      }
      const point = pointFrom(place.location);
      const category = (place.place_category as { slug: string } | null)?.slug;
      if (!point || !category) {
        return {
          status: 400,
          message: "This place has no location to compare with.",
        };
      }
      return {
        status: 200,
        data: {
          kind: "similar_places",
          targetId: null,
          topicCategory: category,
          point,
          sourceEventId: null,
          sourcePlaceId: place.id,
        },
      };
    }
    case "similar_events": {
      const { data: event } = await service
        .from("event")
        .select(
          "id, organizer_id, status, archived_at, moderation_state, location, event_category",
        )
        .eq("id", target.eventId)
        .maybeSingle();
      if (
        !event ||
        event.status !== "published" ||
        event.archived_at ||
        event.moderation_state === "hidden" ||
        event.moderation_state === "removed"
      ) {
        return { status: 404, message: "Event not found." };
      }
      const point = pointFrom(event.location);
      if (!point || !event.event_category) {
        return {
          status: 400,
          message: "This event has no location to compare with.",
        };
      }
      return {
        status: 200,
        data: {
          kind: "similar_events",
          targetId: null,
          topicCategory: event.event_category,
          point,
          sourceEventId: event.id,
          sourcePlaceId: null,
        },
      };
    }
    default:
      return { status: 400, message: "Unknown subscription." };
  }
}

/** Creates (or re-activates) one subscription. Callers already proved identity. */
export async function subscribeCore(
  service: ServiceRoleClient,
  userId: string,
  target: SubscriptionTarget,
  source: SubscriptionSource,
  options: { skipGuard?: boolean } = {},
): Promise<Envelope<{ subscriptionId: string }>> {
  if (!options.skipGuard) {
    const blocked = await guard(service, userId);
    if (blocked) return blocked;
  }
  if (
    !(await checkRateLimit(
      `subscription:${userId}`,
      MAX_CHANGES_PER_HOUR,
      3600,
    ))
  ) {
    return {
      status: 429,
      message: "Too many changes. Try again in a little while.",
    };
  }

  const resolved = await resolveTarget(service, userId, target);
  if (resolved.status !== 200 || !resolved.data) {
    return resolved as Envelope<never>;
  }
  const t = resolved.data;

  let radiusKm: number | null = null;
  if (t.point) {
    const { settings } = await resolveDiscoveryAccess(service, userId);
    radiusKm = Number(settings?.similar_default_radius_km ?? 25);
  }

  const now = new Date().toISOString();
  const { data, error } = await service
    .from("notification_subscription")
    .upsert(
      {
        user_id: userId,
        kind: t.kind,
        target_id: t.targetId,
        topic_category: t.topicCategory,
        topic_location: t.point
          ? `SRID=4326;POINT(${t.point.lng} ${t.point.lat})`
          : null,
        topic_radius_km: radiusKm,
        source,
        status: "active",
        source_event_id: t.sourceEventId,
        source_place_id: t.sourcePlaceId,
        updated_at: now,
        unsubscribed_at: null,
      } as never,
      { onConflict: "user_id,kind,topic_key" },
    )
    .select("id")
    .single();
  if (error || !data) {
    logger.error(`subscribeCore failed: ${error?.message}`);
    return { status: 500, message: "Couldn't turn on these alerts." };
  }
  return {
    status: 200,
    message: "You'll get alerts for this.",
    data: { subscriptionId: data.id },
  };
}

export async function unsubscribeCore(
  service: ServiceRoleClient,
  userId: string,
  subscriptionId: string,
): Promise<Envelope<{ subscriptionId: string }>> {
  if (!userId) return { status: 401, message: "Please sign in first." };
  if (
    !(await checkRateLimit(
      `subscription:${userId}`,
      MAX_CHANGES_PER_HOUR,
      3600,
    ))
  ) {
    return {
      status: 429,
      message: "Too many changes. Try again in a little while.",
    };
  }
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("notification_subscription")
    .update({ status: "unsubscribed", unsubscribed_at: now, updated_at: now })
    .eq("id", subscriptionId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) {
    logger.error(`unsubscribeCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't turn off these alerts." };
  }
  if (!data) return { status: 404, message: "Subscription not found." };
  return {
    status: 200,
    message: "Alerts turned off.",
    data: { subscriptionId: data.id },
  };
}

/** Status of the "Notify me" bell for an organizer or a place. */
export async function getSubscriptionStatusCore(
  service: ServiceRoleClient,
  userId: string,
  kind: "organizer" | "place",
  targetId: string,
): Promise<Envelope<SubscriptionStatusResult>> {
  if (!userId) return { status: 401, message: "Please sign in first." };
  const { data, error } = await service
    .from("notification_subscription")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("target_id", targetId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    logger.error(`getSubscriptionStatusCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }
  return {
    status: 200,
    data: { subscribed: !!data, subscriptionId: data?.id ?? null },
  };
}

/** Everything a person follows, with readable labels, for the preference centre. */
export async function listSubscriptionsCore(
  service: ServiceRoleClient,
  userId: string,
): Promise<Envelope<NotificationSubscription[]>> {
  if (!userId) return { status: 401, message: "Please sign in first." };
  const { data, error } = await service
    .from("notification_subscription")
    .select(
      "id, kind, status, source, created_at, target_id, topic_category, topic_radius_km, source_event_id, source_place_id",
    )
    .eq("user_id", userId)
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    logger.error(`listSubscriptionsCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't load your alerts." };
  }
  const rows = data ?? [];

  const organizerIds = rows
    .filter((r) => r.kind === "organizer")
    .map((r) => r.target_id as string);
  const placeIds = [
    ...rows.filter((r) => r.kind === "place").map((r) => r.target_id as string),
    ...rows.map((r) => r.source_place_id).filter((v): v is string => !!v),
  ];
  const eventIds = rows
    .map((r) => r.source_event_id)
    .filter((v): v is string => !!v);

  const [organizers, places, events, categories] = await Promise.all([
    organizerIds.length
      ? service
          .from("user_info")
          .select("id, username, avatar_public_id, avatar_version")
          .in("id", organizerIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            username: string | null;
            avatar_public_id: string | null;
            avatar_version: string | null;
          }[],
        }),
    placeIds.length
      ? service
          .from("place")
          .select("id, name, slug, cover_public_id, cover_version, address")
          .in("id", [...new Set(placeIds)])
      : Promise.resolve({
          data: [] as {
            id: string;
            name: string | null;
            slug: string | null;
            cover_public_id: string | null;
            cover_version: string | null;
            address: unknown;
          }[],
        }),
    eventIds.length
      ? service
          .from("event")
          .select("id, address")
          .in("id", [...new Set(eventIds)])
      : Promise.resolve({ data: [] as { id: string; address: unknown }[] }),
    service.from("place_category").select("slug, name"),
  ]);

  const orgById = new Map((organizers.data ?? []).map((o) => [o.id, o]));
  const placeById = new Map((places.data ?? []).map((p) => [p.id, p]));
  const eventById = new Map((events.data ?? []).map((e) => [e.id, e]));
  const categoryName = new Map(
    (categories.data ?? []).map((c) => [c.slug, c.name]),
  );

  const items: NotificationSubscription[] = [];
  for (const r of rows) {
    const base = {
      id: r.id,
      kind: r.kind as SubscriptionKind,
      status: r.status as NotificationSubscription["status"],
      source: r.source as SubscriptionSource,
      createdAt: r.created_at,
      targetId: r.target_id,
      topicCategory: r.topic_category,
      topicRadiusKm:
        r.topic_radius_km == null ? null : Number(r.topic_radius_km),
    };
    if (r.kind === "organizer") {
      const org = orgById.get(r.target_id as string);
      if (!org) continue;
      items.push({
        ...base,
        label: `@${org.username ?? "organizer"}`,
        targetSlug: org.username ?? null,
        imagePublicId: org.avatar_public_id,
        imageVersion: org.avatar_version,
      });
    } else if (r.kind === "place") {
      const place = placeById.get(r.target_id as string);
      if (!place) continue;
      items.push({
        ...base,
        label: place.name ?? "A place",
        targetSlug: place.slug,
        imagePublicId: place.cover_public_id,
        imageVersion: place.cover_version,
      });
    } else {
      const sourceAddress =
        r.kind === "similar_events"
          ? addressText(eventById.get(r.source_event_id ?? "")?.address)
          : addressText(placeById.get(r.source_place_id ?? "")?.address);
      const locality = localityFromAddress(sourceAddress);
      const what =
        r.kind === "similar_events"
          ? `${r.topic_category} events`
          : `${categoryName.get(r.topic_category ?? "") ?? r.topic_category} places`;
      items.push({
        ...base,
        label: locality ? `${what} near ${locality}` : `${what} nearby`,
        targetSlug: null,
        imagePublicId: null,
        imageVersion: null,
      });
    }
  }
  return { status: 200, data: items };
}
