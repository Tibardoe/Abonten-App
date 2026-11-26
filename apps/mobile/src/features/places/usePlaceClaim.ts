import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { uuidv4 } from "@/lib/uuid";
import { formatDate } from "@abonten/core/i18n/format";
import {
  CLAIM_DOC_BUCKET,
  claimDocExtension,
  claimDocPath,
  claimDocProblem,
  guessClaimDocMime,
} from "@abonten/core/placeClaimDocuments";
import { placeClaimRefusal } from "@abonten/core/placeClaimInvite";
import { getCurrentLocale, translatorFor } from "@abonten/ui-native/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Native echo of the web submitPlaceClaimRequest action + getPlaceClaimRequests
// (claimant view). `place_claim_request` has claimant-scoped RLS
// (place_claim_request_claimant_insert / _claimant_select,
// auth.uid() = claimant_id), so submitting a claim and reading back the
// caller's own claim status both run straight from the client — no
// /api/mobile endpoint. Ownership NEVER changes here; only an admin approval
// on web (approve_place_claim RPC) does that. The partial unique index
// idx_place_claim_request_one_pending is the backstop against duplicate
// pending claims (surfaces as Postgres 23505).
//
// §12: supporting documents (proof of ownership / authorization) go to the
// PRIVATE `place-claim-documents` Storage bucket at
// <claimant_id>/<claim_request_id>/<uuid>.<ext> (storage RLS keys on the
// first path segment = the caller's uid) and are indexed in
// `place_claim_document`. Only the claimant and admin reviewers can read
// them — see migration 20260903190000_add_place_claim_documents.sql. The
// limits and the stored path are @abonten/core/placeClaimDocuments, shared
// with the website's form.
//
// The database refuses some requests (place_claim_request_guard, migration
// 20261126140000): from someone who already runs the place, and an
// ownership dispute from someone whose last request for the same place
// staff turned down less than 30 days ago. Each refusal reaches the person
// as a sentence in their language (placeClaimRefusal).

export {
  CLAIM_DOC_MAX_FILES,
  CLAIM_DOC_MAX_BYTES,
  CLAIM_DOC_ACCEPTED_MIME,
} from "@abonten/core/placeClaimDocuments";

export type StagedClaimDoc = {
  /** Local key so the list can track it before it has a server id. */
  key: string;
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  isImage: boolean;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

export type PlaceClaimState = {
  /** The caller's most recent claim on this place, if any. */
  status: "none" | "pending" | "approved" | "rejected";
  /** When staff decided it (placeClaimInvite's wait after a refusal). */
  reviewedAt: string | null;
  /** Signed-in, not the owner, and no pending/approved claim already. */
  canClaim: boolean;
};

export function validateClaimDoc(file: {
  mimeType: string;
  sizeBytes: number | null;
}): string | null {
  const problem = claimDocProblem(file);
  if (problem === "type") {
    return translatorFor("places")("onlyJpgPngWebpOrPdf");
  }
  if (problem === "size") {
    return translatorFor("places")("thatFileIsOver10Mb");
  }
  return null;
}

/**
 * Best-effort MIME for a picked file (guessClaimDocMime): the picker's
 * value, then the URI/name extension, then the caller's fallback.
 */
export const guessMime = guessClaimDocMime;

async function fetchClaimState(
  userId: string | undefined,
  placeId: string,
  ownerId: string | null | undefined,
): Promise<PlaceClaimState> {
  if (!userId) return { status: "none", reviewedAt: null, canClaim: false };
  if (ownerId && userId === ownerId) {
    return { status: "none", reviewedAt: null, canClaim: false };
  }

  const { data, error } = await supabase
    .from("place_claim_request")
    .select("status, created_at, reviewed_at")
    .eq("place_id", placeId)
    .eq("claimant_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Not known is not "no request": the page offers nothing until it is.
  if (error) throw error;

  const status =
    (data?.status as PlaceClaimState["status"] | undefined) ?? "none";
  // A rejected claimant may re-request; a pending/approved one may not.
  const canClaim = status !== "pending" && status !== "approved";
  return { status, reviewedAt: data?.reviewed_at ?? null, canClaim };
}

export function usePlaceClaimState(
  placeId: string | undefined,
  ownerId: string | null | undefined,
) {
  const { session } = useSession();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["mobile", "place-claim", placeId, userId],
    enabled: !!placeId,
    queryFn: () => fetchClaimState(userId, placeId as string, ownerId),
  });
}

/**
 * Upload one staged document to the private bucket and index it. Returns the
 * uploaded storage path on success; throws on failure so the caller can mark
 * that row "error" and offer a retry.
 */
export async function uploadClaimDocument(
  userId: string,
  claimId: string,
  file: StagedClaimDoc,
): Promise<string> {
  const path = claimDocPath(
    userId,
    claimId,
    uuidv4(),
    claimDocExtension(file.mimeType, file.name),
  );

  // RN: read the local file into an ArrayBuffer for supabase-js. `fetch` on a
  // file:// URI is the supported Expo path (no extra base64 dependency).
  const res = await fetch(file.uri);
  const bytes = await res.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(CLAIM_DOC_BUCKET)
    .upload(path, bytes, {
      contentType: file.mimeType,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { error: rowError } = await supabase
    .from("place_claim_document")
    .insert({
      claim_request_id: claimId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
    });
  if (rowError) {
    // Roll the orphaned object back so a retry doesn't leave two copies.
    await supabase.storage.from(CLAIM_DOC_BUCKET).remove([path]);
    throw rowError;
  }

  return path;
}

export function useSubmitPlaceClaim(placeId: string | undefined) {
  const qc = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (input: {
      note?: string;
      contactPhone?: string;
      contactEmail?: string;
    }): Promise<{ claimId: string }> => {
      if (!userId) throw new Error("Not signed in");
      if (!placeId) throw new Error("Missing place");
      const { data, error } = await supabase
        .from("place_claim_request")
        .insert({
          place_id: placeId,
          claimant_id: userId,
          note: input.note?.trim() || null,
          contact_phone: input.contactPhone?.trim() || null,
          contact_email: input.contactEmail?.trim() || null,
          status: "pending",
        })
        .select("id")
        .single();
      if (error) {
        const t = translatorFor("places");
        const refusal = placeClaimRefusal(error);
        if (refusal === "pending") throw new Error(t("claimAlreadyPending"));
        if (refusal === "runs_place") throw new Error(t("claimRunsPlace"));
        if (refusal === "dispute_wait") {
          throw new Error(
            t("disputeWait", {
              date: formatDate(error.details, getCurrentLocale()),
            }),
          );
        }
        throw error;
      }
      return { claimId: data.id as string };
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["mobile", "place-claim", placeId, userId],
      });
    },
  });
}
