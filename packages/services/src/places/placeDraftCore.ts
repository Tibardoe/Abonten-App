import { logger } from "@abonten/core/logger";
import {
  type PlaceDraftPayload,
  placeDraftPayloadSchema,
} from "@abonten/validation/placeDraftSchema";
import type { SupabaseClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Post-auth bodies of savePlaceDraft / getPlaceDrafts / getPlaceDraft /
// deletePlaceDraft, lifted so the mobile place-drafts routes run the same
// logic. Mirrors eventDraftCore.ts exactly, swapping the flyer fields for a
// cover-photo pair and the child table for place_drafts. The cover bytes
// never pass through here — savePlaceDraftCore takes an already-uploaded
// public_id/version (the device uploads with kind "place_photo"), where the
// web savePlaceDraft action still accepts a File and uploads it first, then
// delegates. NOT a "use server" file.

export type PlaceDraftListItem = {
  id: string;
  title: string | null;
  updatedAt: string;
  expiresAt: string;
  coverPublicId: string | null;
  coverVersion: string | null;
};

export type PlaceDraftDetail = {
  id: string;
  updatedAt: string;
  expiresAt: string;
  payload: PlaceDraftPayload;
  coverPublicId: string | null;
  coverVersion: string | null;
};

export type SavePlaceDraftCoreResult =
  | {
      status: 200;
      message: string;
      data: { draftId: string; updatedAt: string | undefined };
    }
  | { status: 400 | 404 | 409 | 500; message: string };

export async function savePlaceDraftCore(
  supabase: SupabaseClient,
  userId: string,
  input: {
    draftId?: string;
    payload: PlaceDraftPayload;
    expectedUpdatedAt?: string;
    coverPublicId?: string;
    coverVersion?: string;
  },
): Promise<SavePlaceDraftCoreResult> {
  const { draftId, expectedUpdatedAt } = input;
  const coverPublicId = input.coverPublicId;
  const coverVersion = input.coverVersion;

  const parsed = placeDraftPayloadSchema.safeParse(input.payload);
  if (!parsed.success) {
    return { status: 400, message: "Invalid draft data." };
  }

  let previousCoverPublicId: string | null = null;

  if (draftId) {
    const { data: existingDraft, error: existingDraftError } = await supabase
      .from("drafts")
      .select("id, user_id, updated_at")
      .eq("id", draftId)
      .eq("draft_type", "place")
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

    const { data: existingPlaceDraft } = await supabase
      .from("place_drafts")
      .select("cover_public_id")
      .eq("draft_id", draftId)
      .maybeSingle();

    previousCoverPublicId = existingPlaceDraft?.cover_public_id ?? null;
  }

  const title = parsed.data.name?.trim() || null;

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

    const placeDraftUpdate: {
      payload: PlaceDraftPayload;
      cover_public_id?: string;
      cover_version?: string;
    } = { payload: parsed.data };

    if (coverPublicId) {
      placeDraftUpdate.cover_public_id = coverPublicId;
      placeDraftUpdate.cover_version = coverVersion;
    }

    const { error: updatePlaceDraftError } = await supabase
      .from("place_drafts")
      .update(placeDraftUpdate)
      .eq("draft_id", draftId);

    if (updatePlaceDraftError) {
      return {
        status: 500,
        message: `Failed to save draft: ${updatePlaceDraftError.message}`,
      };
    }

    const { data: refreshedDraft } = await supabase
      .from("drafts")
      .select("updated_at")
      .eq("id", draftId)
      .single();

    if (
      coverPublicId &&
      previousCoverPublicId &&
      previousCoverPublicId !== coverPublicId
    ) {
      try {
        await cloudinary.uploader.destroy(previousCoverPublicId, {
          resource_type: "image",
        });
      } catch (cloudError) {
        logger.error("Failed to clean up replaced draft cover:", cloudError);
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
    .insert({ user_id: userId, draft_type: "place", title })
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

  const { error: insertPlaceDraftError } = await supabase
    .from("place_drafts")
    .insert({
      draft_id: newDraft.id,
      payload: parsed.data,
      cover_public_id: coverPublicId ?? null,
      cover_version: coverVersion ?? null,
    });

  if (insertPlaceDraftError) {
    // Not one DB transaction from the JS client — roll the base row back so a
    // failed second insert can't orphan a drafts row with no child.
    await supabase.from("drafts").delete().eq("id", newDraft.id);
    return {
      status: 500,
      message: `Failed to save draft: ${insertPlaceDraftError.message}`,
    };
  }

  return {
    status: 200,
    message: "Draft saved.",
    data: { draftId: newDraft.id, updatedAt: newDraft.updated_at },
  };
}

export type PlaceDraftsListResult =
  | { status: 200; data: PlaceDraftListItem[] }
  | { status: 500; message: string; data: PlaceDraftListItem[] };

export async function fetchPlaceDraftsList(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlaceDraftsListResult> {
  const { data: drafts, error: draftsError } = await supabase
    .from("drafts")
    .select("id, title, updated_at, expires_at")
    .eq("user_id", userId)
    .eq("draft_type", "place")
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false });

  if (draftsError) {
    return { status: 500, message: draftsError.message, data: [] };
  }
  if (!drafts || drafts.length === 0) {
    return { status: 200, data: [] };
  }

  const draftIds = drafts.map((d) => d.id);

  const { data: placeDrafts, error: placeDraftsError } = await supabase
    .from("place_drafts")
    .select("draft_id, cover_public_id, cover_version")
    .in("draft_id", draftIds);

  if (placeDraftsError) {
    return { status: 500, message: placeDraftsError.message, data: [] };
  }

  const coverByDraftId = new Map(
    (placeDrafts ?? []).map((pd) => [pd.draft_id, pd]),
  );

  const data: PlaceDraftListItem[] = drafts.map((d) => ({
    id: d.id,
    title: d.title,
    updatedAt: d.updated_at,
    expiresAt: d.expires_at,
    coverPublicId: coverByDraftId.get(d.id)?.cover_public_id ?? null,
    coverVersion: coverByDraftId.get(d.id)?.cover_version ?? null,
  }));

  return { status: 200, data };
}

export type PlaceDraftDetailResult =
  | { status: 200; data: PlaceDraftDetail }
  | { status: 404 | 410 | 500; message: string };

export async function fetchPlaceDraftDetail(
  supabase: SupabaseClient,
  userId: string,
  draftId: string,
): Promise<PlaceDraftDetailResult> {
  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .select("id, user_id, updated_at, expires_at")
    .eq("id", draftId)
    .eq("draft_type", "place")
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

  const { data: placeDraft, error: placeDraftError } = await supabase
    .from("place_drafts")
    .select("payload, cover_public_id, cover_version")
    .eq("draft_id", draftId)
    .maybeSingle();

  if (placeDraftError || !placeDraft) {
    return {
      status: 500,
      message: placeDraftError?.message ?? "Draft data not found.",
    };
  }

  const parsedPayload = placeDraftPayloadSchema.safeParse(placeDraft.payload);

  return {
    status: 200,
    data: {
      id: draft.id,
      updatedAt: draft.updated_at,
      expiresAt: draft.expires_at,
      payload: parsedPayload.success ? parsedPayload.data : {},
      coverPublicId: placeDraft.cover_public_id,
      coverVersion: placeDraft.cover_version,
    },
  };
}

export type DeletePlaceDraftCoreResult = {
  status: 200 | 404 | 500;
  message: string;
};

export async function deletePlaceDraftCore(
  supabase: SupabaseClient,
  userId: string,
  draftId: string,
): Promise<DeletePlaceDraftCoreResult> {
  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .select("id, user_id")
    .eq("id", draftId)
    .eq("draft_type", "place")
    .maybeSingle();

  if (draftError) {
    return { status: 500, message: draftError.message };
  }
  if (!draft || draft.user_id !== userId) {
    return { status: 404, message: "Draft not found." };
  }

  const { data: placeDraft } = await supabase
    .from("place_drafts")
    .select("cover_public_id")
    .eq("draft_id", draftId)
    .maybeSingle();

  // Cloudinary-first, DB-second (matches deleteHighlight.ts) — a failed
  // destroy leaves the row so the asset can be found and retried.
  if (placeDraft?.cover_public_id) {
    try {
      const result = await cloudinary.uploader.destroy(
        placeDraft.cover_public_id,
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
