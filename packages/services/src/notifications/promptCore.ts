import { logger } from "@abonten/core/logger";
import {
  EMPTY_PROMPT_OFFER,
  type PromptContext,
  type PromptOffer,
  type PromptResponse,
  type SubscriptionSource,
} from "@abonten/types/discoveryType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type DiscoverySettingRow,
  resolveDiscoveryAccess,
} from "../search/discoveryProgram";
import { localityFromAddress, subscribeCore } from "./subscriptionCore";

// Opt-in prompts shown after a meaningful interaction:
//   * a paid ticket or a free RSVP  -> "similar events near you" (+ an
//     unticked "also alert me when @organizer posts")
//   * favoriting a place, reviewing it, or a second check-in within 90 days
//     -> "updates from this place and similar places"
//
// Rules, all enforced here (never trusted to the client):
//   * nothing is offered unless the programme's prompts are on for the person
//   * never offered when a matching subscription is already active
//   * a "Not now" silences that prompt for prompt_dismiss_days (30)
//   * each prompt is shown at most prompt_max_shows (3) times, ever
//   * at most one prompt of any kind every prompt_cooldown_days (7) — the
//     prompt currently on screen is exempt so a re-render keeps showing it
//
// getPromptOfferCore is read-only. The client calls markPromptShownCore when
// the card actually appears and respondToPromptCore on a button press.

type Envelope<T> = {
  status: 200 | 400 | 401 | 403 | 404 | 500;
  message?: string;
  data?: T;
};

type PromptKind = "similar_events" | "organizer" | "place";
type OfferKey = { kind: PromptKind; targetKey: string };

type PromptStateRow = {
  kind: string;
  target_key: string;
  shown_count: number;
  last_shown_at: string | null;
  dismissed_at: string | null;
  accepted_at: string | null;
};

const DAY_MS = 86_400_000;

function eligible(
  state: PromptStateRow | undefined,
  settings: DiscoverySettingRow,
): boolean {
  if (!state) return true;
  if (state.accepted_at) return false;
  if (state.shown_count >= settings.prompt_max_shows) return false;
  if (
    state.dismissed_at &&
    Date.now() - new Date(state.dismissed_at).getTime() <
      settings.prompt_dismiss_days * DAY_MS
  ) {
    return false;
  }
  return true;
}

type Candidate = { offer: PromptOffer; keys: OfferKey[] };

async function buildCandidate(
  service: ServiceRoleClient,
  userId: string,
  context: PromptContext,
): Promise<Candidate | null> {
  if (context.context === "purchase" || context.context === "rsvp") {
    const { data: event } = await service
      .from("event")
      .select(
        "id, organizer_id, event_category, address, status, archived_at, moderation_state, user_info!organizer_id(username, status_id)",
      )
      .eq("id", context.eventId)
      .maybeSingle();
    if (
      !event ||
      event.status !== "published" ||
      event.archived_at ||
      event.moderation_state === "hidden" ||
      event.moderation_state === "removed"
    ) {
      return null;
    }
    // Only after the person really has a ticket or an RSVP for this event.
    const { count } = await service
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("user_id", userId)
      .eq("status", "attending");
    if ((count ?? 0) === 0) return null;

    const organizer = event.user_info as {
      username: string | null;
      status_id: number;
    } | null;
    const offer: PromptOffer = { ...EMPTY_PROMPT_OFFER };
    const keys: OfferKey[] = [];
    if (event.event_category) {
      const targetKey = event.event_category.toLowerCase();
      offer.similarEvents = {
        targetKey,
        category: event.event_category,
        locality: localityFromAddress(
          (event.address as { full_address?: string } | null)?.full_address,
        ),
      };
      keys.push({ kind: "similar_events", targetKey });
    }
    if (
      event.organizer_id !== userId &&
      organizer?.username &&
      organizer.status_id === 1
    ) {
      offer.organizer = {
        targetKey: event.organizer_id,
        organizerId: event.organizer_id,
        username: organizer.username,
      };
      keys.push({ kind: "organizer", targetKey: event.organizer_id });
    }
    return { offer, keys };
  }

  const { data: place } = await service
    .from("place")
    .select(
      "id, name, owner_id, status, moderation_state, place_category(name)",
    )
    .eq("id", context.placeId)
    .maybeSingle();
  if (
    !place ||
    place.status !== "published" ||
    place.moderation_state === "hidden" ||
    place.moderation_state === "removed" ||
    place.owner_id === userId
  ) {
    return null;
  }

  // The interaction must really have happened.
  if (context.trigger === "favorite") {
    const { count } = await service
      .from("favorite_place")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("place_id", place.id);
    if ((count ?? 0) === 0) return null;
  } else if (context.trigger === "review") {
    const { count } = await service
      .from("place_review")
      .select("id", { count: "exact", head: true })
      .eq("reviewer_id", userId)
      .eq("place_id", place.id);
    if ((count ?? 0) === 0) return null;
  } else {
    // A first check-in is often reward-driven; a second one within 90 days is interest.
    const since = new Date(Date.now() - 90 * DAY_MS).toISOString().slice(0, 10);
    const { count } = await service
      .from("place_visit")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("place_id", place.id)
      .gte("visited_on", since);
    if ((count ?? 0) < 2) return null;
  }

  return {
    offer: {
      ...EMPTY_PROMPT_OFFER,
      place: {
        targetKey: place.id,
        placeId: place.id,
        name: place.name ?? "this place",
        category:
          (place.place_category as { name: string } | null)?.name ?? null,
      },
    },
    keys: [{ kind: "place", targetKey: place.id }],
  };
}

async function activeSubscriptionsBlock(
  service: ServiceRoleClient,
  userId: string,
  offer: PromptOffer,
): Promise<PromptOffer> {
  const { data } = await service
    .from("notification_subscription")
    .select("kind, target_id, topic_category")
    .eq("user_id", userId)
    .eq("status", "active");
  const rows = data ?? [];
  const has = (pred: (r: (typeof rows)[number]) => boolean) => rows.some(pred);
  return {
    similarEvents:
      offer.similarEvents &&
      !has(
        (r) =>
          r.kind === "similar_events" &&
          (r.topic_category ?? "").toLowerCase() ===
            offer.similarEvents?.targetKey,
      )
        ? offer.similarEvents
        : null,
    organizer:
      offer.organizer &&
      !has(
        (r) =>
          r.kind === "organizer" &&
          r.target_id === offer.organizer?.organizerId,
      )
        ? offer.organizer
        : null,
    place:
      offer.place &&
      !has((r) => r.kind === "place" && r.target_id === offer.place?.placeId)
        ? offer.place
        : null,
  };
}

async function readStates(
  service: ServiceRoleClient,
  userId: string,
): Promise<PromptStateRow[]> {
  const { data, error } = await service
    .from("notification_prompt_state")
    .select(
      "kind, target_key, shown_count, last_shown_at, dismissed_at, accepted_at",
    )
    .eq("user_id", userId);
  if (error) {
    logger.error(`notification_prompt_state read failed: ${error.message}`);
    throw error;
  }
  return data ?? [];
}

function stateFor(states: PromptStateRow[], key: OfferKey) {
  return states.find(
    (s) => s.kind === key.kind && s.target_key === key.targetKey,
  );
}

export async function getPromptOfferCore(
  service: ServiceRoleClient,
  userId: string,
  context: PromptContext,
): Promise<Envelope<PromptOffer>> {
  if (!userId) return { status: 401, message: "Please sign in first." };
  const { program, settings } = await resolveDiscoveryAccess(service, userId);
  if (!program.prompts || !settings) {
    return { status: 200, data: EMPTY_PROMPT_OFFER };
  }

  try {
    const candidate = await buildCandidate(service, userId, context);
    if (!candidate) return { status: 200, data: EMPTY_PROMPT_OFFER };

    const states = await readStates(service, userId);
    const offerKeys = new Set(
      candidate.keys.map((k) => `${k.kind}:${k.targetKey}`),
    );

    // Global cooldown: another prompt was shown recently.
    const cooldownMs = settings.prompt_cooldown_days * DAY_MS;
    const recentOther = states.some(
      (s) =>
        s.last_shown_at &&
        Date.now() - new Date(s.last_shown_at).getTime() < cooldownMs &&
        !offerKeys.has(`${s.kind}:${s.target_key}`),
    );
    if (recentOther) return { status: 200, data: EMPTY_PROMPT_OFFER };

    let offer = await activeSubscriptionsBlock(
      service,
      userId,
      candidate.offer,
    );
    offer = {
      similarEvents:
        offer.similarEvents &&
        eligible(
          stateFor(states, {
            kind: "similar_events",
            targetKey: offer.similarEvents.targetKey,
          }),
          settings,
        )
          ? offer.similarEvents
          : null,
      organizer:
        offer.organizer &&
        eligible(
          stateFor(states, {
            kind: "organizer",
            targetKey: offer.organizer.targetKey,
          }),
          settings,
        )
          ? offer.organizer
          : null,
      place:
        offer.place &&
        eligible(
          stateFor(states, { kind: "place", targetKey: offer.place.targetKey }),
          settings,
        )
          ? offer.place
          : null,
    };
    // The organizer line only rides along with the main similar-events card.
    if (!offer.similarEvents && context.context !== "place") {
      offer = { ...offer, organizer: null };
    }
    return { status: 200, data: offer };
  } catch (e) {
    logger.error(`getPromptOfferCore failed: ${e}`);
    return { status: 200, data: EMPTY_PROMPT_OFFER };
  }
}

function keysOf(offer: PromptOffer): OfferKey[] {
  const keys: OfferKey[] = [];
  if (offer.similarEvents)
    keys.push({
      kind: "similar_events",
      targetKey: offer.similarEvents.targetKey,
    });
  if (offer.organizer)
    keys.push({ kind: "organizer", targetKey: offer.organizer.targetKey });
  if (offer.place)
    keys.push({ kind: "place", targetKey: offer.place.targetKey });
  return keys;
}

async function writeStates(
  service: ServiceRoleClient,
  userId: string,
  keys: OfferKey[],
  change: (existing: PromptStateRow | undefined) => Partial<PromptStateRow>,
): Promise<void> {
  if (keys.length === 0) return;
  const states = await readStates(service, userId);
  const now = new Date().toISOString();
  const rows = keys.map((k) => {
    const existing = stateFor(states, k);
    return {
      user_id: userId,
      kind: k.kind,
      target_key: k.targetKey,
      shown_count: existing?.shown_count ?? 0,
      last_shown_at: existing?.last_shown_at ?? null,
      dismissed_at: existing?.dismissed_at ?? null,
      accepted_at: existing?.accepted_at ?? null,
      ...change(existing),
      updated_at: now,
    };
  });
  const { error } = await service
    .from("notification_prompt_state")
    .upsert(rows, { onConflict: "user_id,kind,target_key" });
  if (error) {
    logger.error(`notification_prompt_state write failed: ${error.message}`);
    throw error;
  }
}

export async function markPromptShownCore(
  service: ServiceRoleClient,
  userId: string,
  context: PromptContext,
): Promise<Envelope<{ recorded: boolean }>> {
  const offer = await getPromptOfferCore(service, userId, context);
  if (offer.status !== 200 || !offer.data) return offer as Envelope<never>;
  const keys = keysOf(offer.data);
  if (keys.length === 0) return { status: 200, data: { recorded: false } };
  try {
    const now = new Date().toISOString();
    await writeStates(service, userId, keys, (existing) => ({
      // A re-render of the same card within an hour is one showing.
      shown_count:
        existing?.last_shown_at &&
        Date.now() - new Date(existing.last_shown_at).getTime() < 3_600_000
          ? existing.shown_count
          : (existing?.shown_count ?? 0) + 1,
      last_shown_at: now,
    }));
    return { status: 200, data: { recorded: true } };
  } catch {
    return { status: 500, message: "Something went wrong!" };
  }
}

export async function respondToPromptCore(
  service: ServiceRoleClient,
  userId: string,
  input: PromptResponse,
): Promise<Envelope<{ subscribed: string[] }>> {
  if (!userId) return { status: 401, message: "Please sign in first." };
  const offerRes = await getPromptOfferCore(service, userId, input.context);
  if (offerRes.status !== 200 || !offerRes.data)
    return offerRes as Envelope<never>;
  const offer = offerRes.data;
  const keys = keysOf(offer);
  if (keys.length === 0) {
    return { status: 200, data: { subscribed: [] } };
  }

  const now = new Date().toISOString();
  if (input.response === "dismissed") {
    try {
      await writeStates(service, userId, keys, () => ({ dismissed_at: now }));
    } catch {
      return { status: 500, message: "Something went wrong!" };
    }
    return {
      status: 200,
      message: "Okay, we won't ask about this for a while.",
      data: { subscribed: [] },
    };
  }

  const accept = input.accept ?? { similarEvents: true, place: true };
  const source: SubscriptionSource =
    input.context.context === "purchase"
      ? "purchase_prompt"
      : input.context.context === "rsvp"
        ? "rsvp_prompt"
        : "place_prompt";

  const subscribed: string[] = [];
  const accepted: OfferKey[] = [];
  const declined: OfferKey[] = [];

  if (offer.similarEvents && input.context.context !== "place") {
    const key = {
      kind: "similar_events" as const,
      targetKey: offer.similarEvents.targetKey,
    };
    if (accept.similarEvents) {
      const res = await subscribeCore(
        service,
        userId,
        { kind: "similar_events", eventId: input.context.eventId },
        source,
        { skipGuard: true },
      );
      if (res.status === 200) {
        subscribed.push("similar_events");
        accepted.push(key);
      }
    } else {
      declined.push(key);
    }
  }
  if (offer.organizer) {
    const key = {
      kind: "organizer" as const,
      targetKey: offer.organizer.targetKey,
    };
    if (accept.organizer) {
      const res = await subscribeCore(
        service,
        userId,
        { kind: "organizer", organizerId: offer.organizer.organizerId },
        source,
        { skipGuard: true },
      );
      if (res.status === 200) {
        subscribed.push("organizer");
        accepted.push(key);
      }
    } else {
      declined.push(key);
    }
  }
  if (offer.place) {
    const key = { kind: "place" as const, targetKey: offer.place.targetKey };
    if (accept.place) {
      const [placeRes, similarRes] = await Promise.all([
        subscribeCore(
          service,
          userId,
          { kind: "place", placeId: offer.place.placeId },
          source,
          { skipGuard: true },
        ),
        subscribeCore(
          service,
          userId,
          { kind: "similar_places", placeId: offer.place.placeId },
          source,
          { skipGuard: true },
        ),
      ]);
      if (placeRes.status === 200) subscribed.push("place");
      if (similarRes.status === 200) subscribed.push("similar_places");
      if (placeRes.status === 200 || similarRes.status === 200)
        accepted.push(key);
    } else {
      declined.push(key);
    }
  }

  try {
    await writeStates(service, userId, accepted, () => ({ accepted_at: now }));
    await writeStates(service, userId, declined, () => ({ dismissed_at: now }));
  } catch {
    // The subscriptions exist; a missed prompt-state write only risks one
    // extra prompt later, which the active-subscription check suppresses.
  }

  if (subscribed.length === 0 && accepted.length === 0 && declined.length > 0) {
    return {
      status: 200,
      message: "Okay, we won't ask about this for a while.",
      data: { subscribed },
    };
  }
  if (subscribed.length === 0) {
    return {
      status: 500,
      message: "Couldn't turn on these alerts. Please try again.",
    };
  }
  return {
    status: 200,
    message:
      "Alerts on. You can change this any time in Settings › Notifications.",
    data: { subscribed },
  };
}
