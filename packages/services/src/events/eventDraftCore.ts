import { logger } from "@abonten/core/logger";
import {
  type EventDraftPayload,
  eventDraftPayloadSchema,
} from "@abonten/validation/eventDraftSchema";
import type { SupabaseClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Post-auth bodies of saveEventDraft / getEventDrafts / getEventDraft /
// deleteEventDraft, lifted so the mobile event-drafts routes run the same
// logic. The flyer bytes never pass through here — saveEventDraftCore takes
// an already-uploaded public_id/version (the device uploads straight to
// Cloudinary with kind "event_flyer", same as the create wizard), where the
// web saveEventDraft action still accepts a File and uploads it first, then
// delegates. NOT a "use server" file.

export type EventDraftListItem = {
  id: string;
  title: string | null;
  updatedAt: string;
  expiresAt: string;
  flyerPublicId: string | null;
  flyerVersion: string | null;
};

export type EventDraftDetail = {
  id: string;
  updatedAt: string;
  expiresAt: string;
  payload: EventDraftPayload;
  flyerPublicId: string | null;
  flyerVersion: string | null;
};

export type SaveEventDraftCoreResult =
  | {
      status: 200;
      message: string;
      data: { draftId: string; updatedAt: string | undefined };
    }
  | { status: 400 | 404 | 409 | 500; message: string };

export async function saveEventDraftCore(
  supabase: SupabaseClient,
  userId: string,
  input: {
    draftId?: string;
    payload: EventDraftPayload;
    expectedUpdatedAt?: string;
    flyerPublicId?: string;
    flyerVersion?: string;
  },
): Promise<SaveEventDraftCoreResult> {
  const { draftId, expectedUpdatedAt } = input;
  const flyerPublicId = input.flyerPublicId;
  const flyerVersion = input.flyerVersion;

  const parsed = eventDraftPayloadSchema.safeParse(input.payload);
  if (!parsed.success) {
    return { status: 400, message: "Invalid draft data." };
  }

  let previousFlyerPublicId: string | null = null;

  if (draftId) {
    const { data: existingDraft, error: existingDraftError } = await supabase
      .from("drafts")
      .select("id, user_id, updated_at")
      .eq("id", draftId)
      .eq("draft_type", "event")
      .maybeSingle();

    if (existingDraftError) {
      return {
        status: 500,
        message: `Error loading draft: ${existingDraftError.message}`,
      };
    }
    if (!existingDraft || existingDraft.user_id !== userId) {
      return { status: 404, message: "Draft not found." };
    }
    if (expectedUpdatedAt && existingDraft.updated_at !== expectedUpdatedAt) {
      return {
        status: 409,
        message:
          "This draft was updated elsewhere — reload to see the latest version.",
      };
    }

    const { data: existingEventDraft } = await supabase
      .from("event_drafts")
      .select("flyer_public_id")
      .eq("draft_id", draftId)
      .maybeSingle();

    previousFlyerPublicId = existingEventDraft?.flyer_public_id ?? null;
  }

  const title = parsed.data.title?.trim() || null;

  if (draftId) {
    const { error: updateDraftError } = await supabase
      .from("drafts")
      .update({ title })
      .eq("id", draftId)
      .eq("user_id", userId);

    if (updateDraftError) {
      return {
        status: 500,
        message: `Failed to save draft: ${updateDraftError.message}`,
      };
    }

    const eventDraftUpdate: {
      payload: EventDraftPayload;
      flyer_public_id?: string;
      flyer_version?: string;
    } = { payload: parsed.data };

    if (flyerPublicId) {
      eventDraftUpdate.flyer_public_id = flyerPublicId;
      eventDraftUpdate.flyer_version = flyerVersion;
    }

    const { error: updateEventDraftError } = await supabase
      .from("event_drafts")
      .update(eventDraftUpdate)
      .eq("draft_id", draftId);

    if (updateEventDraftError) {
      return {
        status: 500,
        message: `Failed to save draft: ${updateEventDraftError.message}`,
      };
    }

    const { data: refreshedDraft } = await supabase
      .from("drafts")
      .select("updated_at")
      .eq("id", draftId)
      .single();

    if (
      flyerPublicId &&
      previousFlyerPublicId &&
      previousFlyerPublicId !== flyerPublicId
    ) {
      try {
        await cloudinary.uploader.destroy(previousFlyerPublicId, {
          resource_type: "image",
        });
      } catch (cloudError) {
        logger.error("Failed to clean up replaced draft flyer:", cloudError);
      }
    }

    return {
      status: 200,
      message: "Draft saved.",
      data: { draftId, updatedAt: refreshedDraft?.updated_at },
    };
  }

  const { data: newDraft, error: insertDraftError } = await supabase
    .from("drafts")
    .insert({ user_id: userId, draft_type: "event", title })
    .select("id, updated_at")
    .single();

  if (insertDraftError || !newDraft) {
    return {
      status: 500,
      message: `Failed to save draft: ${
        insertDraftError?.message ?? "unknown error"
      }`,
    };
  }

  const { error: insertEventDraftError } = await supabase
    .from("event_drafts")
    .insert({
      draft_id: newDraft.id,
      payload: parsed.data,
      flyer_public_id: flyerPublicId ?? null,
      flyer_version: flyerVersion ?? null,
    });

  if (insertEventDraftError) {
    // Not one DB transaction from the JS client — roll the base row back so a
    // failed second insert can't orphan a drafts row with no child.
    await supabase.from("drafts").delete().eq("id", newDraft.id);
    return {
      status: 500,
      message: `Failed to save draft: ${insertEventDraftError.message}`,
    };
  }

  return {
    status: 200,
    message: "Draft saved.",
    data: { draftId: newDraft.id, updatedAt: newDraft.updated_at },
  };
}

export type EventDraftsListResult =
  | { status: 200; data: EventDraftListItem[] }
  | { status: 500; message: string; data: EventDraftListItem[] };

export async function fetchEventDraftsList(
  supabase: SupabaseClient,
  userId: string,
): Promise<EventDraftsListResult> {
  const { data: drafts, error: draftsError } = await supabase
    .from("drafts")
    .select("id, title, updated_at, expires_at")
    .eq("user_id", userId)
    .eq("draft_type", "event")
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false });

  if (draftsError) {
    return { status: 500, message: draftsError.message, data: [] };
  }
  if (!drafts || drafts.length === 0) {
    return { status: 200, data: [] };
  }

  const draftIds = drafts.map((d) => d.id);

  const { data: eventDrafts, error: eventDraftsError } = await supabase
    .from("event_drafts")
    .select("draft_id, flyer_public_id, flyer_version")
    .in("draft_id", draftIds);

  if (eventDraftsError) {
    return { status: 500, message: eventDraftsError.message, data: [] };
  }

  const flyerByDraftId = new Map(
    (eventDrafts ?? []).map((ed) => [ed.draft_id, ed]),
  );

  const data: EventDraftListItem[] = drafts.map((d) => ({
    id: d.id,
    title: d.title,
    updatedAt: d.updated_at,
    expiresAt: d.expires_at,
    flyerPublicId: flyerByDraftId.get(d.id)?.flyer_public_id ?? null,
    flyerVersion: flyerByDraftId.get(d.id)?.flyer_version ?? null,
  }));

  return { status: 200, data };
}

export type EventDraftDetailResult =
  | { status: 200; data: EventDraftDetail }
  | { status: 404 | 410 | 500; message: string };

export async function fetchEventDraftDetail(
  supabase: SupabaseClient,
  userId: string,
  draftId: string,
): Promise<EventDraftDetailResult> {
  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .select("id, user_id, updated_at, expires_at")
    .eq("id", draftId)
    .eq("draft_type", "event")
    .maybeSingle();

  if (draftError) {
    return { status: 500, message: draftError.message };
  }
  if (!draft || draft.user_id !== userId) {
    return { status: 404, message: "Draft not found." };
  }
  if (new Date(draft.expires_at) <= new Date()) {
    return { status: 410, message: "This draft has expired." };
  }

  const { data: eventDraft, error: eventDraftError } = await supabase
    .from("event_drafts")
    .select("payload, flyer_public_id, flyer_version")
    .eq("draft_id", draftId)
    .maybeSingle();

  if (eventDraftError || !eventDraft) {
    return {
      status: 500,
      message: eventDraftError?.message ?? "Draft data not found.",
    };
  }

  // jsonb round-trips Date fields as ISO strings — re-run the draft schema
  // (its date fields use z.coerce.date()) so callers get a consistent shape.
  const parsedPayload = eventDraftPayloadSchema.safeParse(eventDraft.payload);

  return {
    status: 200,
    data: {
      id: draft.id,
      updatedAt: draft.updated_at,
      expiresAt: draft.expires_at,
      payload: parsedPayload.success ? parsedPayload.data : {},
      flyerPublicId: eventDraft.flyer_public_id,
      flyerVersion: eventDraft.flyer_version,
    },
  };
}

export type DeleteEventDraftCoreResult = {
  status: 200 | 404 | 500;
  message: string;
};

export async function deleteEventDraftCore(
  supabase: SupabaseClient,
  userId: string,
  draftId: string,
): Promise<DeleteEventDraftCoreResult> {
  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .select("id, user_id")
    .eq("id", draftId)
    .eq("draft_type", "event")
    .maybeSingle();

  if (draftError) {
    return { status: 500, message: draftError.message };
  }
  if (!draft || draft.user_id !== userId) {
    return { status: 404, message: "Draft not found." };
  }

  const { data: eventDraft } = await supabase
    .from("event_drafts")
    .select("flyer_public_id")
    .eq("draft_id", draftId)
    .maybeSingle();

  // Cloudinary-first, DB-second (matches deleteHighlight.ts) — a failed
  // destroy leaves the row so the asset can be found and retried.
  if (eventDraft?.flyer_public_id) {
    try {
      const result = await cloudinary.uploader.destroy(
        eventDraft.flyer_public_id,
        { resource_type: "image" },
      );
      if (result.result !== "ok" && result.result !== "not found") {
        return {
          status: 500,
          message: "Failed to delete draft image. Please try again.",
        };
      }
    } catch (cloudError) {
      logger.error("Cloudinary deletion failed:", cloudError);
      return {
        status: 500,
        message: "Failed to delete draft image. Please try again.",
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("drafts")
    .delete()
    .eq("id", draftId)
    .eq("user_id", userId);

  if (deleteError) {
    return {
      status: 500,
      message: `Failed to delete draft: ${deleteError.message}`,
    };
  }

  return { status: 200, message: "Draft deleted." };
}
