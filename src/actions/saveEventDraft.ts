"use server";

import { createClient } from "@/config/supabase/server";
import {
  type EventDraftPayload,
  eventDraftPayloadSchema,
} from "@/utils/eventDraftSchema";
import { v2 as cloudinary } from "cloudinary";
import { saveEventFlyerToCloudinary } from "./saveEventFlyerToCloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

type SaveEventDraftInput = {
  draftId?: string;
  payload: EventDraftPayload;
  // The updated_at the client last saw for this draft — used for a
  // lightweight optimistic-concurrency check (see the 409 branch below)
  // rather than silently overwriting a change made in another tab.
  expectedUpdatedAt?: string;
  flyerFile?: File | null;
};

// Saves (creates or updates) an event draft. Deliberately does none of the
// imperative "is this publishable" validation useEventUploadForm's onSubmit
// does — only the draft-safe eventDraftPayloadSchema, so a draft with only
// a title is valid.
export async function saveEventDraft({
  draftId,
  payload,
  expectedUpdatedAt,
  flyerFile,
}: SaveEventDraftInput) {
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

  const parsed = eventDraftPayloadSchema.safeParse(payload);
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

    const { data: existingEventDraft } = await supabase
      .from("event_drafts")
      .select("flyer_public_id")
      .eq("draft_id", draftId)
      .maybeSingle();

    previousFlyerPublicId = existingEventDraft?.flyer_public_id ?? null;
  }

  let flyerPublicId: string | undefined;
  let flyerVersion: string | undefined;

  if (flyerFile) {
    const upload = await saveEventFlyerToCloudinary(flyerFile);
    if (!upload?.public_id || !upload?.version) {
      return {
        status: 500,
        message:
          (upload as { error?: string })?.error ?? "Flyer upload failed.",
      };
    }
    flyerPublicId = upload.public_id;
    flyerVersion = String(upload.version);
  }

  const title = parsed.data.title?.trim() || null;

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

    // A replaced flyer's old asset is now unreferenced — clean it up
    // best-effort rather than leaving it in Cloudinary indefinitely. Not
    // fatal to the save if this fails.
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
        console.error("Failed to clean up replaced draft flyer:", cloudError);
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
    .insert({ user_id: user.id, draft_type: "event", title })
    .select("id, updated_at")
    .single();

  if (insertDraftError || !newDraft) {
    return {
      status: 500,
      message: `Failed to save draft: ${insertDraftError?.message ?? "unknown error"}`,
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
    // Not run inside one DB transaction from the JS client — roll the base
    // row back manually so a failed second insert can't leave an orphaned
    // drafts row with no event_drafts child.
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
