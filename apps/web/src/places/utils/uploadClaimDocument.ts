"use client";

import { supabase } from "@/config/supabase/client";
import {
  CLAIM_DOC_BUCKET,
  claimDocExtension,
  claimDocPath,
} from "@abonten/core/placeClaimDocuments";

/**
 * Uploads one proof document of a claim the visitor has just filed, the
 * same way the app does (apps/mobile/src/features/places/usePlaceClaim.ts):
 * into the private bucket under their own folder, then listed in
 * place_claim_document. Both writes are the claimant's own, allowed by the
 * storage and table rules (migration 20260903184813). Throws on failure so
 * the form can mark the file and offer a retry.
 */
export async function uploadClaimDocument(
  claimantId: string,
  claimId: string,
  file: File,
  mimeType: string,
): Promise<void> {
  const path = claimDocPath(
    claimantId,
    claimId,
    crypto.randomUUID(),
    claimDocExtension(mimeType, file.name),
  );

  const { error: uploadError } = await supabase.storage
    .from(CLAIM_DOC_BUCKET)
    .upload(path, file, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;

  const { error: rowError } = await supabase
    .from("place_claim_document")
    .insert({
      claim_request_id: claimId,
      storage_path: path,
      file_name: file.name,
      mime_type: mimeType,
      size_bytes: file.size,
    });
  if (rowError) {
    // A retry must not leave two copies behind.
    await supabase.storage.from(CLAIM_DOC_BUCKET).remove([path]);
    throw rowError;
  }
}
