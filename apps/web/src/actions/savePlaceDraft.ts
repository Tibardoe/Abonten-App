"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { userFacingError } from "@abonten/core/userFacingError";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type SavePlaceDraftCoreResult,
  savePlaceDraftCore,
} from "@abonten/services/places/placeDraftCore";
import type { PlaceDraftPayload } from "@abonten/validation/placeDraftSchema";
import { savePlacePhotoToCloudinary } from "./savePlacePhotoToCloudinary";

type SavePlaceDraftInput = {
  draftId?: string;
  payload: PlaceDraftPayload;
  // The updated_at the client last saw — a lightweight
  // optimistic-concurrency check (the 409 branch in the core).
  expectedUpdatedAt?: string;
  coverFile?: File | null;
};

// Thin wrapper — auth + the browser File upload here, the draft-safe
// placeDraftPayloadSchema validation + the drafts/place_drafts writes +
// replaced-cover cleanup in savePlaceDraftCore (shared with /api/mobile,
// which passes an already-uploaded cover instead of a File).
export const savePlaceDraft = withActionLocale(async function savePlaceDraft({
  draftId,
  payload,
  expectedUpdatedAt,
  coverFile,
}: SavePlaceDraftInput): Promise<
  SavePlaceDraftCoreResult | { status: 401 | 500; message: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500 as const,
      message: userFacingError("Error fetching user", userError),
    };
  }
  if (!user) {
    return {
      status: 401 as const,
      message: tr("userNotAuthenticated"),
    };
  }

  let coverPublicId: string | undefined;
  let coverVersion: string | undefined;

  if (coverFile) {
    const upload = await savePlacePhotoToCloudinary(coverFile);
    if (!upload?.public_id || !upload?.version) {
      return {
        status: 500 as const,
        message:
          (upload as { error?: string })?.error ?? tr("coverPhotoUploadFailed"),
      };
    }
    coverPublicId = upload.public_id;
    coverVersion = String(upload.version);
  }

  return savePlaceDraftCore(supabase, user.id, {
    draftId,
    payload,
    expectedUpdatedAt,
    coverPublicId,
    coverVersion,
  });
});
