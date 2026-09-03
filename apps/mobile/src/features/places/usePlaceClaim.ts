import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { uuidv4 } from "@/lib/uuid";
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
// them — see migration 20260903190000_add_place_claim_documents.sql.

export const CLAIM_DOC_BUCKET = "place-claim-documents";
export const CLAIM_DOC_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const CLAIM_DOC_MAX_FILES = 3;
export const CLAIM_DOC_ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];

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
  /** Signed-in, not the owner, and no pending/approved claim already. */
  canClaim: boolean;
};

export function validateClaimDoc(file: {
  mimeType: string;
  sizeBytes: number | null;
}): string | null {
  if (!CLAIM_DOC_ACCEPTED_MIME.includes(file.mimeType)) {
    return "Only JPG, PNG, WebP or PDF files are accepted.";
  }
  if (file.sizeBytes != null && file.sizeBytes > CLAIM_DOC_MAX_BYTES) {
    return "That file is over 10 MB. Please attach a smaller one.";
  }
  return null;
}

function extensionFor(mimeType: string, name: string): string {
  const fromName = name.includes(".") ? name.split(".").pop() : null;
  if (fromName) return fromName.toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "application/pdf": "pdf",
  };
  return map[mimeType] ?? "bin";
}

async function fetchClaimState(
  userId: string | undefined,
  placeId: string,
  ownerId: string | null | undefined,
): Promise<PlaceClaimState> {
  if (!userId) return { status: "none", canClaim: false };
  if (ownerId && userId === ownerId) return { status: "none", canClaim: false };

  const { data } = await supabase
    .from("place_claim_request")
    .select("status, created_at")
    .eq("place_id", placeId)
    .eq("claimant_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const status =
    (data?.status as PlaceClaimState["status"] | undefined) ?? "none";
  // A rejected claimant may re-request; a pending/approved one may not.
  const canClaim = status !== "pending" && status !== "approved";
  return { status, canClaim };
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
  const ext = extensionFor(file.mimeType, file.name);
  const path = `${userId}/${claimId}/${uuidv4()}.${ext}`;

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
        if (error.code === "23505")
          throw new Error(
            "You already have a pending claim request for this place.",
          );
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
