import {
  ALLOWED_IMAGE_UPLOAD_FORMATS,
  ALLOWED_VIDEO_UPLOAD_FORMATS,
  MAX_AVATAR_UPLOAD_SIZE_BYTES,
  MAX_EVENT_FLYER_SIZE_BYTES,
  MAX_HIGHLIGHT_UPLOAD_SIZE_BYTES,
  MAX_PLACE_PHOTO_SIZE_BYTES,
  MAX_REVIEW_PHOTO_SIZE_BYTES,
} from "@abonten/core/uploadLimits";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import { v2 as cloudinary } from "cloudinary";

// A signature costs nothing server-side to produce but authorizes one real
// Cloudinary upload -- unbounded requests here is unbounded upload volume
// against the account's storage/bandwidth quota. Generous relative to any
// real multi-photo gallery upload.
const MAX_SIGNATURES_PER_MINUTE = 60;

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Shared body of the direct browser/app -> Cloudinary upload authorizers
// (getAvatarUploadSignature.ts, getHighlightUploadSignature.ts, the two
// review-photo ones, getPlacePhotoUploadSignature.ts) and the mobile
// /api/mobile/uploads/signature route. CLOUDINARY_API_SECRET never leaves
// the server.
//
// The signature covers FOUR params, all of which Cloudinary re-derives and
// verifies against the request:
//   • folder          — bound to the caller's own user id, so an upload
//                        can't be redirected into another user's folder
//                        (the matching write action re-checks the prefix).
//   • allowed_formats — Cloudinary rejects any other format server-side, so
//                        a client can't smuggle in an executable / SVG /
//                        arbitrary "raw" blob.
//   • max_file_size   — Cloudinary rejects anything larger server-side, so
//                        upload size no longer depends on a client-asserted
//                        `bytes` field (see uploadHighlight.ts) or on trust.
// The client MUST send these three plus `timestamp` verbatim or the
// signature check fails — @abonten/api-client's uploadToCloudinary helpers
// forward exactly what this returns.

export type UploadSignatureKind =
  | "avatar"
  | "highlight"
  | "place_photo"
  | "event_flyer"
  | "event_review_photo"
  | "place_review_photo";

const FOLDER_PREFIX: Record<UploadSignatureKind, string> = {
  avatar: "user_profiles",
  highlight: "highlight_media",
  place_photo: "place_photos",
  // The web saveEventFlyerToCloudinary uploads to a flat "event_flyers"
  // folder; the signed mobile upload scopes it per user like every other
  // kind here (buildCloudinaryUrl only needs public_id + version, so the
  // folder difference is cosmetic).
  event_flyer: "event_flyers",
  event_review_photo: "event_review_photos",
  place_review_photo: "place_review_photos",
};

// Per-kind format + size ceiling baked into the signature. Everything but
// `highlight` is images-only; `highlight` also accepts a short video, so it
// takes the video format list and the video size cap.
const UPLOAD_CONSTRAINTS: Record<
  UploadSignatureKind,
  { allowedFormats: string; maxFileSizeBytes: number }
> = {
  avatar: {
    allowedFormats: ALLOWED_IMAGE_UPLOAD_FORMATS,
    maxFileSizeBytes: MAX_AVATAR_UPLOAD_SIZE_BYTES,
  },
  highlight: {
    allowedFormats: `${ALLOWED_IMAGE_UPLOAD_FORMATS},${ALLOWED_VIDEO_UPLOAD_FORMATS}`,
    maxFileSizeBytes: MAX_HIGHLIGHT_UPLOAD_SIZE_BYTES,
  },
  place_photo: {
    allowedFormats: ALLOWED_IMAGE_UPLOAD_FORMATS,
    maxFileSizeBytes: MAX_PLACE_PHOTO_SIZE_BYTES,
  },
  event_flyer: {
    allowedFormats: ALLOWED_IMAGE_UPLOAD_FORMATS,
    maxFileSizeBytes: MAX_EVENT_FLYER_SIZE_BYTES,
  },
  event_review_photo: {
    allowedFormats: ALLOWED_IMAGE_UPLOAD_FORMATS,
    maxFileSizeBytes: MAX_REVIEW_PHOTO_SIZE_BYTES,
  },
  place_review_photo: {
    allowedFormats: ALLOWED_IMAGE_UPLOAD_FORMATS,
    maxFileSizeBytes: MAX_REVIEW_PHOTO_SIZE_BYTES,
  },
};

export type CloudinarySignatureData = {
  timestamp: number;
  signature: string;
  apiKey: string | undefined;
  cloudName: string | undefined;
  folder: string;
  /** Comma-separated allow-list; send verbatim as the `allowed_formats` param. */
  allowedFormats: string;
  /** Send verbatim as the `max_file_size` param (bytes). */
  maxFileSizeBytes: number;
};

// Same shape the get*UploadSignature Server Actions have always returned:
// a 200 with `data`, a 401 with `message`, or (new) a 429 when the caller is
// requesting signatures faster than any real upload flow would. Kept as a
// discriminated union so existing callers (useAvatarUpload.ts etc.) narrow
// on `status` exactly as before.
export type UploadSignatureResult =
  | { status: 200; data: CloudinarySignatureData; message?: undefined }
  | { status: 401 | 429; message: string; data?: undefined };

export function isUploadSignatureKind(
  value: unknown,
): value is UploadSignatureKind {
  return typeof value === "string" && value in FOLDER_PREFIX;
}

export async function buildCloudinaryUploadSignature(
  userId: string,
  kind: UploadSignatureKind,
): Promise<UploadSignatureResult> {
  const allowed = await checkRateLimit(
    `cloudinary-signature:${userId}`,
    MAX_SIGNATURES_PER_MINUTE,
    60,
  );

  if (!allowed) {
    return {
      status: 429,
      message: "Too many upload requests. Please try again shortly.",
    };
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = `${FOLDER_PREFIX[kind]}/${userId}`;
  const { allowedFormats, maxFileSizeBytes } = UPLOAD_CONSTRAINTS[kind];

  // Every signed param must be echoed verbatim by the client or Cloudinary's
  // own signature check fails. Param names are Cloudinary's snake_case
  // upload-API names, not the camelCase we return.
  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp,
      folder,
      allowed_formats: allowedFormats,
      max_file_size: maxFileSizeBytes,
    },
    process.env.CLOUDINARY_API_SECRET as string,
  );

  return {
    status: 200,
    data: {
      timestamp,
      signature,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      folder,
      allowedFormats,
      maxFileSizeBytes,
    },
  };
}
