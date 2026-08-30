"use server";

import { createClient } from "@/config/supabase/server";
import {
  type EventDraftPayload,
  eventDraftPayloadSchema,
} from "@/utils/eventDraftSchema";

export type EventDraftDetail = {
  id: string;
  updatedAt: string;
  expiresAt: string;
  payload: EventDraftPayload;
  flyerPublicId: string | null;
  flyerVersion: string | null;
};

// Full-payload fetch, used only when the user chooses "Continue" on a
// specific draft. Ownership and expiry are both re-checked here — never
// trust that a draftId reaching this action is actually the caller's or
// still alive.
export async function getEventDraft(draftId: string) {
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
    .eq("draft_type", "event")
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

  const { data: eventDraft, error: eventDraftError } = await supabase
    .from("event_drafts")
    .select("payload, flyer_public_id, flyer_version")
    .eq("draft_id", draftId)
    .maybeSingle();

  if (eventDraftError || !eventDraft) {
    return {
      status: 500,
      message: eventDraftError?.message ?? "Draft data not found.",
      data: null,
    };
  }

  // jsonb round-trips every Date field as a plain ISO string — re-run the
  // draft-safe schema (its date fields use z.coerce.date()) so the form
  // hydrates with real Date instances, not strings that crash the first
  // .toLocaleDateString()/.toLocaleTimeString() call downstream.
  const parsedPayload = eventDraftPayloadSchema.safeParse(eventDraft.payload);

  const detail: EventDraftDetail = {
    id: draft.id,
    updatedAt: draft.updated_at,
    expiresAt: draft.expires_at,
    payload: parsedPayload.success ? parsedPayload.data : {},
    flyerPublicId: eventDraft.flyer_public_id,
    flyerVersion: eventDraft.flyer_version,
  };

  return { status: 200, message: "OK", data: detail };
}
