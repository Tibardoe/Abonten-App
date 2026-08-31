import { v2 as cloudinary } from "cloudinary";

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
// the server; the folder is bound to the caller's own user id and included
// in the signature, so the upload cannot be redirected into another user's
// folder without invalidating it — the matching write action re-checks the
// folder prefix to enforce ownership.

export type UploadSignatureKind =
  | "avatar"
  | "highlight"
  | "place_photo"
  | "event_review_photo"
  | "place_review_photo";

const FOLDER_PREFIX: Record<UploadSignatureKind, string> = {
  avatar: "user_profiles",
  highlight: "highlight_media",
  place_photo: "place_photos",
  event_review_photo: "event_review_photos",
  place_review_photo: "place_review_photos",
};

export type CloudinarySignatureData = {
  timestamp: number;
  signature: string;
  apiKey: string | undefined;
  cloudName: string | undefined;
  folder: string;
};

// Same shape the get*UploadSignature Server Actions have always returned:
// a 200 with `data`, or a 401 with `message`. Kept as a discriminated union
// so existing callers (useAvatarUpload.ts etc.) narrow on `status` exactly
// as before.
export type UploadSignatureResult =
  | { status: 200; data: CloudinarySignatureData; message?: undefined }
  | { status: 401; message: string; data?: undefined };

export function isUploadSignatureKind(
  value: unknown,
): value is UploadSignatureKind {
  return typeof value === "string" && value in FOLDER_PREFIX;
}

export function buildCloudinaryUploadSignature(
  userId: string,
  kind: UploadSignatureKind,
): { status: 200; data: CloudinarySignatureData; message?: undefined } {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = `${FOLDER_PREFIX[kind]}/${userId}`;

  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
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
    },
  };
}
