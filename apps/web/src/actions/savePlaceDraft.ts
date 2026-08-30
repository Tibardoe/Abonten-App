"use server";

import { createClient } from "@/config/supabase/server";
import {
  type PlaceDraftPayload,
  placeDraftPayloadSchema,
} from "@/utils/placeDraftSchema";
import { logger } from "@abonten/core/logger";
import { v2 as cloudinary } from "cloudinary";
import { savePlacePhotoToCloudinary } from "./savePlacePhotoToCloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

type SavePlaceDraftInput = {
  draftId?: string;
  payload: PlaceDraftPayload;
  // The updated_at the client last saw for this draft — used for a
  // lightweight optimistic-concurrency check (see the 409 branch below)
  // rather than silently overwriting a change made in another tab.
  expectedUpdatedAt?: string;
  coverFile?: File | null;
};

// Saves (creates or updates) a place draft. Mirrors saveEventDraft.ts
// exactly, swapping the flyer fields for a cover-photo pair and the child
// table for place_drafts. Deliberately does none of the imperative "is
// this publishable" validation usePlaceUploadForm's onSubmit does — only
// the draft-safe placeDraftPayloadSchema, so a draft with only a name is
// valid.
export async function savePlaceDraft({
  draftId,
  payload,
  expectedUpdatedAt,
  coverFile,
}: SavePlaceDraftInput) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message}`,
    };
  }
  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const parsed = placeDraftPayloadSchema.safeParse(payload);
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
    if (!existingDraft || existingDraft.user_id !== user.id) {
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

  let coverPublicId: string | undefined;
  let coverVersion: string | undefined;

  if (coverFile) {
    const upload = await savePlacePhotoToCloudinary(coverFile);
    if (!upload?.public_id || !upload?.version) {
      return {
        status: 500,
        message:
          (upload as { error?: string })?.error ?? "Cover photo upload failed.",
      };
    }
    coverPublicId = upload.public_id;
    coverVersion = String(upload.version);
  }

  const title = parsed.data.name?.trim() || null;

  if (draftId) {
    const { error: updateDraftError } = await supabase
      .from("drafts")
      .update({ title })
      .eq("id", draftId)
      .eq("user_id", user.id);

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

    // A replaced cover photo's old asset is now unreferenced — clean it up
    // best-effort rather than leaving it in Cloudinary indefinitely. Not
    // fatal to the save if this fails.
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
    .insert({ user_id: user.id, draft_type: "place", title })
    .select("id, updated_at")
    .single();

  if (insertDraftError || !newDraft) {
    return {
      status: 500,
      message: `Failed to save draft: ${insertDraftError?.message ?? "unknown error"}`,
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
    // Not run inside one DB transaction from the JS client — roll the base
    // row back manually so a failed second insert can't leave an orphaned
    // drafts row with no place_drafts child.
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
