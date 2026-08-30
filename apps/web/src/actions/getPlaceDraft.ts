"use server";

import { createClient } from "@/config/supabase/server";
import {
  type PlaceDraftPayload,
  placeDraftPayloadSchema,
} from "@abonten/validation/placeDraftSchema";

export type PlaceDraftDetail = {
  id: string;
  updatedAt: string;
  expiresAt: string;
  payload: PlaceDraftPayload;
  coverPublicId: string | null;
  coverVersion: string | null;
};

// Full-payload fetch, used only when the owner chooses "Continue" on a
// specific draft. Ownership and expiry are both re-checked here — never
// trust that a draftId reaching this action is actually the caller's or
// still alive. Mirrors getEventDraft.ts.
export async function getPlaceDraft(draftId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { status: 500, message: userError.message, data: null };
  }
  if (!user) {
    return { status: 401, message: "User not authenticated", data: null };
  }

  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .select("id, user_id, updated_at, expires_at")
    .eq("id", draftId)
    .eq("draft_type", "place")
    .maybeSingle();

  if (draftError) {
    return { status: 500, message: draftError.message, data: null };
  }
  if (!draft || draft.user_id !== user.id) {
    return { status: 404, message: "Draft not found.", data: null };
  }
  if (new Date(draft.expires_at) <= new Date()) {
    return { status: 410, message: "This draft has expired.", data: null };
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
      data: null,
    };
  }

  const parsedPayload = placeDraftPayloadSchema.safeParse(placeDraft.payload);

  const detail: PlaceDraftDetail = {
    id: draft.id,
    updatedAt: draft.updated_at,
    expiresAt: draft.expires_at,
    payload: parsedPayload.success ? parsedPayload.data : {},
    coverPublicId: placeDraft.cover_public_id,
    coverVersion: placeDraft.cover_version,
  };

  return { status: 200, message: "OK", data: detail };
}
