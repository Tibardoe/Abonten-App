import {
  ALLOWED_IMAGE_UPLOAD_FORMATS,
  ALLOWED_VIDEO_UPLOAD_FORMATS,
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
// The signature covers TWO params, both of which Cloudinary re-derives and
// verifies against the request:
//   • folder          — bound to the caller's own user id, so an upload
//                        can't be redirected into another user's folder
//                        (the matching write action re-checks the prefix).
//   • allowed_formats — Cloudinary rejects any other format server-side, so
//                        a client can't smuggle in an executable / SVG /
//                        arbitrary "raw" blob.
// The client MUST send these two plus `timestamp` verbatim or the signature
// check fails — @abonten/api-client's uploadToCloudinary helpers forward
// exactly what this returns.
//
// There is deliberately no `max_file_size` here: it looks like a real signed
// upload parameter but isn't one Cloudinary's API recognizes — Cloudinary
// silently drops it when reconstructing the string it verifies the signature
// against, so a signature computed *with* it never matches and every upload
// is rejected with "Invalid Signature" (found live 2026-09-05: this exact
// bug had every mobile upload, and every web avatar/highlight/place-gallery/
// review-photo upload, failing 100% of the time since it was added). Upload
// size is enforced two ways instead: the app's own MAX_*_SIZE_BYTES checks
// before a file is ever selected (unchanged, see e.g. useAvatarUpload.ts),
// and Cloudinary's own account-level size ceiling as the real backstop —
// its rejection is a normal error response the caller surfaces to the user,
// not a client-invented signed constraint.

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

// Per-kind allowed format list baked into the signature. Everything but
// `highlight` is images-only; `highlight` also accepts a short video, so it
// takes the video format list too.
const UPLOAD_CONSTRAINTS: Record<
  UploadSignatureKind,
  { allowedFormats: string }
> = {
  avatar: { allowedFormats: ALLOWED_IMAGE_UPLOAD_FORMATS },
  highlight: {
    allowedFormats: `${ALLOWED_IMAGE_UPLOAD_FORMATS},${ALLOWED_VIDEO_UPLOAD_FORMATS}`,
  },
  place_photo: { allowedFormats: ALLOWED_IMAGE_UPLOAD_FORMATS },
  event_flyer: { allowedFormats: ALLOWED_IMAGE_UPLOAD_FORMATS },
  event_review_photo: { allowedFormats: ALLOWED_IMAGE_UPLOAD_FORMATS },
  place_review_photo: { allowedFormats: ALLOWED_IMAGE_UPLOAD_FORMATS },
};

export type CloudinarySignatureData = {
  timestamp: number;
  signature: string;
  apiKey: string | undefined;
  cloudName: string | undefined;
  folder: string;
  /** Comma-separated allow-list; send verbatim as the `allowed_formats` param. */
  allowedFormats: string;
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
  const { allowedFormats } = UPLOAD_CONSTRAINTS[kind];

  // Every signed param must be echoed verbatim by the client or Cloudinary's
  // own signature check fails. Param names are Cloudinary's snake_case
  // upload-API names, not the camelCase we return.
  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp,
      folder,
      allowed_formats: allowedFormats,
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
    },
  };
}
