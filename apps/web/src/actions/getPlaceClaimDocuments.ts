"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";

// Admin-only: the private supporting documents attached to a place claim
// (§12). Re-checks user_info.is_admin server-side itself — never trusts a
// client-side claim, same defense-in-depth reasoning as
// getPlaceClaimRequests.ts. Returns short-lived signed URLs into the
// private `place-claim-documents` bucket; the storage RLS
// (`place_claim_docs_read`) also gates this to admins, so a leaked action
// call from a non-admin still resolves nothing.

const SIGNED_URL_TTL_SECONDS = 300;

export type PlaceClaimDocument = {
  id: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  url: string | null;
};

export async function getPlaceClaimDocuments(
  requestId: string,
): Promise<{ status: number; data: PlaceClaimDocument[]; message?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, data: [], message: "User not authenticated" };
  }

  const { data: userInfo } = await supabase
    .from("user_info")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!userInfo?.is_admin) {
    return { status: 403, data: [], message: "Not authorized" };
  }

  const { data: rows, error } = await supabase
    .from("place_claim_document")
    .select("id, storage_path, file_name, mime_type, size_bytes")
    .eq("claim_request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) {
    logger.error(`Failed fetching claim documents: ${error.message}`);
    return { status: 500, data: [], message: "Something went wrong!" };
  }

  const documents = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data: signed } = await supabase.storage
        .from("place-claim-documents")
        .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
      return {
        id: row.id,
        fileName: row.file_name,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        url: signed?.signedUrl ?? null,
      } satisfies PlaceClaimDocument;
    }),
  );

  return { status: 200, data: documents };
}
