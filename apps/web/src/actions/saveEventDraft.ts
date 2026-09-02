"use server";

import { createClient } from "@/config/supabase/server";
import {
  type SaveEventDraftCoreResult,
  saveEventDraftCore,
} from "@/utils/eventDraftCore";
import type { EventDraftPayload } from "@abonten/validation/eventDraftSchema";
import { saveEventFlyerToCloudinary } from "./saveEventFlyerToCloudinary";

type SaveEventDraftInput = {
  draftId?: string;
  payload: EventDraftPayload;
  // The updated_at the client last saw for this draft — a lightweight
  // optimistic-concurrency check (see the 409 branch in the core) rather
  // than silently overwriting a change made in another tab.
  expectedUpdatedAt?: string;
  flyerFile?: File | null;
};

// Thin wrapper — auth + the browser File upload here, the draft-safe
// eventDraftPayloadSchema validation + the drafts/event_drafts writes +
// replaced-flyer cleanup in saveEventDraftCore (shared with /api/mobile,
// which passes an already-uploaded flyer instead of a File).
export async function saveEventDraft({
  draftId,
  payload,
  expectedUpdatedAt,
  flyerFile,
}: SaveEventDraftInput): Promise<
  SaveEventDraftCoreResult | { status: 401 | 500; message: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500 as const,
      message: `Error fetching user: ${userError.message}`,
    };
  }
  if (!user) {
    return { status: 401 as const, message: "User not authenticated" };
  }

  let flyerPublicId: string | undefined;
  let flyerVersion: string | undefined;

  if (flyerFile) {
    const upload = await saveEventFlyerToCloudinary(flyerFile);
    if (!upload?.public_id || !upload?.version) {
      return {
        status: 500 as const,
        message:
          (upload as { error?: string })?.error ?? "Flyer upload failed.",
      };
    }
    flyerPublicId = upload.public_id;
    flyerVersion = String(upload.version);
  }

  return saveEventDraftCore(supabase, user.id, {
    draftId,
    payload,
    expectedUpdatedAt,
    flyerPublicId,
    flyerVersion,
  });
}
