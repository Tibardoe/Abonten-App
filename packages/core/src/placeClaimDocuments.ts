// Proof sent with a request to claim a place: up to three photos or PDFs,
// stored privately in the `place-claim-documents` bucket under
// <claimant_id>/<claim_request_id>/<uuid>.<ext> (the storage rules key on
// the first folder) and listed in `place_claim_document`. Only the claimant
// and Admin › Claims can open them (migration 20260903184813). The website
// and the app upload them the same way, after the request exists.

export const CLAIM_DOC_BUCKET = "place-claim-documents";
/** The bucket's own file_size_limit. */
export const CLAIM_DOC_MAX_BYTES = 10 * 1024 * 1024;
export const CLAIM_DOC_MAX_FILES = 3;
/** The bucket's allowed_mime_types. */
export const CLAIM_DOC_ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heic",
  pdf: "application/pdf",
};

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

/** Why a file cannot be sent: not a photo or PDF, or too big. */
export type ClaimDocProblem = "type" | "size";

export function claimDocProblem(file: {
  mimeType: string;
  sizeBytes: number | null;
}): ClaimDocProblem | null {
  if (!(CLAIM_DOC_ACCEPTED_MIME as readonly string[]).includes(file.mimeType)) {
    return "type";
  }
  if (file.sizeBytes != null && file.sizeBytes > CLAIM_DOC_MAX_BYTES) {
    return "size";
  }
  return null;
}

/**
 * Best-effort type for a picked file. Pickers often leave it out, and a
 * bare fallback would let an unsupported file (a `.gif`, a `.tiff`) past
 * claimDocProblem. The picker's value first, then the name's extension,
 * then the caller's fallback.
 */
export function guessClaimDocMime(
  uri: string,
  name: string | undefined,
  pickerMime: string | undefined,
  fallback: string,
): string {
  if (pickerMime && pickerMime !== "application/octet-stream") {
    return pickerMime;
  }
  const ext = (name ?? uri).split("?")[0].split(".").pop()?.toLowerCase();
  if (ext && EXT_TO_MIME[ext]) return EXT_TO_MIME[ext];
  return fallback;
}

/** The stored object's extension: the file's own, else from its type. */
export function claimDocExtension(mimeType: string, name: string): string {
  const fromName = name.includes(".") ? name.split(".").pop() : null;
  if (fromName) return fromName.toLowerCase();
  return MIME_TO_EXT[mimeType] ?? "bin";
}

/** Where one document of a request is stored in the bucket. */
export function claimDocPath(
  claimantId: string,
  claimId: string,
  fileId: string,
  extension: string,
): string {
  return `${claimantId}/${claimId}/${fileId}.${extension}`;
}
