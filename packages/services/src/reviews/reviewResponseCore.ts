import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationCore } from "../notifications/createNotification";

// Post-auth bodies for the four review-response operations, shared by the
// web Server Actions and the mobile transports so ownership + validation
// can never drift between platforms:
//
//   respondToPlaceReviewCore / respondToEventReviewCore   (create OR edit)
//   deletePlaceReviewResponseCore / deleteEventReviewResponseCore
//
// A place_review / event_review row has no owner/organizer column of its
// own — authorization is by joining through to the owning place.owner_id /
// event.organizer_id and comparing to the caller. RLS
// (place_review_owner_update / event_review_organizer_update) + the
// column-guard triggers already enforce the same thing at the DB, and the
// mutating UPDATEs here run with the CALLER's client so that stays true;
// these functions add the friendly validation, the create-vs-edit message,
// the "hidden/removed content" and "suspended account" gates, and the
// one-time reviewer notification on first reply.
//
// NOT a "use server" file — every function takes an already-authenticated
// SupabaseClient<Database> + resolved userId.

const MAX_RESPONSE_LENGTH = 500;

export type ReviewResponseResult = {
  status: 200 | 400 | 401 | 403 | 404 | 409 | 500;
  message: string;
  data?: {
    response: string | null;
    respondedAt: string | null;
    /** For the web transport's revalidatePath of the public detail page. */
    placeSlug?: string | null;
    eventCode?: string | null;
  };
};

type NormalizedResponse =
  | { ok: true; value: string }
  | { ok: false; message: string };

function normalizeResponse(raw: unknown): NormalizedResponse {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) {
    return { ok: false, message: "Write a reply before posting it." };
  }
  if (trimmed.length > MAX_RESPONSE_LENGTH) {
    return {
      ok: false,
      message: `Keep your reply under ${MAX_RESPONSE_LENGTH} characters.`,
    };
  }
  return { ok: true, value: trimmed };
}

// A suspended / banned account must not be able to post or edit public
// replies. Ban state (user_info.status_id -> user_status: 1 Active,
// 2 Suspended, 3 Banned) is currently only enforced ad hoc — this is one of
// those spots. Fails open on a lookup error (never block a legit owner
// because of a transient read failure).
async function isAccountRestricted(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_info")
    .select("status_id")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return false;
  return data.status_id === 2 || data.status_id === 3;
}

// ---- Place reviews -------------------------------------------------

export async function respondToPlaceReviewCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  reviewId: string,
  response: string,
): Promise<ReviewResponseResult> {
  const normalized = normalizeResponse(response);
  if (!normalized.ok) return { status: 400, message: normalized.message };

  const { data: review, error: fetchError } = await supabase
    .from("place_review")
    .select(
      "id, reviewer_id, owner_response, place:place_id(id, owner_id, name, slug, moderation_state, cover_public_id, cover_version)",
    )
    .eq("id", reviewId)
    .maybeSingle();

  if (fetchError || !review) {
    return { status: 404, message: "Review not found" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: PostgREST embedded-resource shape; no generated types for this join (see PROJECT.md)
  const typedReview = review as any;
  const place = typedReview.place;

  if (!place || place.owner_id !== userId) {
    return { status: 403, message: "Not authorized to respond to this review" };
  }

  if (
    place.moderation_state === "hidden" ||
    place.moderation_state === "removed"
  ) {
    return {
      status: 409,
      message: "This place is not available right now.",
    };
  }

  if (await isAccountRestricted(supabase, userId)) {
    return {
      status: 403,
      message: "Your account can't post replies right now.",
    };
  }

  const isEdit = Boolean(typedReview.owner_response);
  const respondedAt = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("place_review")
    .update({
      owner_response: normalized.value,
      owner_response_at: respondedAt,
    })
    .eq("id", reviewId)
    .select("id");

  if (updateError) {
    return {
      status: 500,
      message: `Error responding to review: ${updateError.message}`,
    };
  }

  if (!updated || updated.length === 0) {
    return { status: 403, message: "Not authorized to respond to this review" };
  }

  // Notify the reviewer only on the FIRST reply — an edit shouldn't
  // re-ping them. Best-effort, never fails the write, skip self-replies.
  if (
    !isEdit &&
    typedReview.reviewer_id &&
    typedReview.reviewer_id !== userId
  ) {
    await createNotificationCore(supabase, {
      userId: typedReview.reviewer_id,
      type: "review_reply",
      title: "The owner replied to your review",
      body: place.name
        ? `See the reply on your review of ${place.name}.`
        : "See the reply on your place review.",
      link: place.slug ? `/places/${place.slug}` : null,
      data: {
        kind: "review_reply",
        placeId: place.id,
        placeSlug: place.slug ?? undefined,
        reviewId,
      },
      imagePublicId: place.cover_public_id ?? null,
      imageVersion: place.cover_version ?? null,
    }).catch(() => {});
  }

  return {
    status: 200,
    message: isEdit ? "Reply updated." : "Reply posted.",
    data: {
      response: normalized.value,
      respondedAt,
      placeSlug: place.slug ?? null,
    },
  };
}

export async function deletePlaceReviewResponseCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  reviewId: string,
): Promise<ReviewResponseResult> {
  const { data: review, error: fetchError } = await supabase
    .from("place_review")
    .select("id, owner_response, place:place_id(owner_id, slug)")
    .eq("id", reviewId)
    .maybeSingle();

  if (fetchError || !review) {
    return { status: 404, message: "Review not found" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: PostgREST embedded-resource shape (see PROJECT.md)
  const place = (review as any).place;

  if (!place || place.owner_id !== userId) {
    return { status: 403, message: "Not authorized to modify this review" };
  }

  // Already gone — idempotent success so a double-tap / retry converges.
  if (!review.owner_response) {
    return {
      status: 200,
      message: "Reply removed.",
      data: {
        response: null,
        respondedAt: null,
        placeSlug: place.slug ?? null,
      },
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from("place_review")
    .update({ owner_response: null, owner_response_at: null })
    .eq("id", reviewId)
    .select("id");

  if (updateError) {
    return {
      status: 500,
      message: `Error removing reply: ${updateError.message}`,
    };
  }

  if (!updated || updated.length === 0) {
    return { status: 403, message: "Not authorized to modify this review" };
  }

  return {
    status: 200,
    message: "Reply removed.",
    data: {
      response: null,
      respondedAt: null,
      placeSlug: place.slug ?? null,
    },
  };
}

// ---- Event reviews ----------------------------------------------------

export async function respondToEventReviewCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  reviewId: string,
  response: string,
): Promise<ReviewResponseResult> {
  const normalized = normalizeResponse(response);
  if (!normalized.ok) return { status: 400, message: normalized.message };

  const { data: review, error: fetchError } = await supabase
    .from("event_review")
    .select(
      "id, reviewer_id, organizer_response, event:event_id(id, event_code, organizer_id, title, moderation_state, flyer_public_id, flyer_version)",
    )
    .eq("id", reviewId)
    .maybeSingle();

  if (fetchError || !review) {
    return { status: 404, message: "Review not found" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: PostgREST embedded-resource shape (see PROJECT.md)
  const typedReview = review as any;
  const event = typedReview.event;

  if (!event || event.organizer_id !== userId) {
    return { status: 403, message: "Not authorized to respond to this review" };
  }

  if (
    event.moderation_state === "hidden" ||
    event.moderation_state === "removed"
  ) {
    return { status: 409, message: "This event is not available right now." };
  }

  if (await isAccountRestricted(supabase, userId)) {
    return {
      status: 403,
      message: "Your account can't post replies right now.",
    };
  }

  const isEdit = Boolean(typedReview.organizer_response);
  const respondedAt = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("event_review")
    .update({
      organizer_response: normalized.value,
      organizer_response_at: respondedAt,
    })
    .eq("id", reviewId)
    .select("id");

  if (updateError) {
    return {
      status: 500,
      message: `Error responding to review: ${updateError.message}`,
    };
  }

  if (!updated || updated.length === 0) {
    return { status: 403, message: "Not authorized to respond to this review" };
  }

  if (
    !isEdit &&
    typedReview.reviewer_id &&
    typedReview.reviewer_id !== userId
  ) {
    await createNotificationCore(supabase, {
      userId: typedReview.reviewer_id,
      type: "review_reply",
      title: "The organizer replied to your review",
      body: event.title
        ? `See the reply on your review of ${event.title}.`
        : "See the reply on your event review.",
      link: event.event_code
        ? `/events/${String(event.event_code).toLowerCase()}`
        : null,
      data: { kind: "review_reply", eventId: event.id, reviewId },
      imagePublicId: event.flyer_public_id ?? null,
      imageVersion: event.flyer_version ?? null,
    }).catch(() => {});
  }

  return {
    status: 200,
    message: isEdit ? "Reply updated." : "Reply posted.",
    data: {
      response: normalized.value,
      respondedAt,
      eventCode: event.event_code ?? null,
    },
  };
}

export async function deleteEventReviewResponseCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  reviewId: string,
): Promise<ReviewResponseResult> {
  const { data: review, error: fetchError } = await supabase
    .from("event_review")
    .select("id, organizer_response, event:event_id(organizer_id, event_code)")
    .eq("id", reviewId)
    .maybeSingle();

  if (fetchError || !review) {
    return { status: 404, message: "Review not found" };
  }

  // biome-ignore lint/suspicious/noExplicitAny: PostgREST embedded-resource shape (see PROJECT.md)
  const event = (review as any).event;

  if (!event || event.organizer_id !== userId) {
    return { status: 403, message: "Not authorized to modify this review" };
  }

  if (!review.organizer_response) {
    return {
      status: 200,
      message: "Reply removed.",
      data: {
        response: null,
        respondedAt: null,
        eventCode: event.event_code ?? null,
      },
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from("event_review")
    .update({ organizer_response: null, organizer_response_at: null })
    .eq("id", reviewId)
    .select("id");

  if (updateError) {
    logger.error(`Error removing event review reply: ${updateError.message}`);
    return {
      status: 500,
      message: `Error removing reply: ${updateError.message}`,
    };
  }

  if (!updated || updated.length === 0) {
    return { status: 403, message: "Not authorized to modify this review" };
  }

  return {
    status: 200,
    message: "Reply removed.",
    data: {
      response: null,
      respondedAt: null,
      eventCode: event.event_code ?? null,
    },
  };
}
