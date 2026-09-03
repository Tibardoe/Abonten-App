// Shared across every event-flyer entry point (create and edit) plus
// saveEventFlyerToCloudinary.ts's server-side check, so the client-side
// rejection message and the server-side defense-in-depth check can never
// drift apart. Mirrors useAvatarUpload.ts's existing 5MB avatar limit —
// event flyers are marketing images, not raw phone-camera photos, so the
// same cap is appropriate. Kept under the 5MB Server Action body limit
// (next.config.ts) since flyers still go through saveEventFlyerToCloudinary
// as a raw File argument, same as avatars.
export const MAX_EVENT_FLYER_SIZE_BYTES = 5 * 1024 * 1024;

// Review photo attachments (place reviews and event reviews share these same
// limits -- one review media system, not two). Size cap matches every other
// image upload in the app; the count cap is a new, deliberately modest
// ceiling (nothing else in this codebase caps a photo gallery's item count)
// chosen so a review stays a quick add-a-few-photos action, not a full
// gallery upload.
export const MAX_REVIEW_PHOTO_SIZE_BYTES = MAX_EVENT_FLYER_SIZE_BYTES;
export const MAX_REVIEW_PHOTOS = 5;

// Original file the user picks for their avatar, before cropping -- a
// generous sanity ceiling against absurd files, not the real size gate.
// Unlike flyers, avatars come straight from a phone camera roll, and the
// picked file gets compressed (see ImageCropper's outputQuality/
// maxOutputDimension props) before upload, so the meaningful limit is
// MAX_AVATAR_UPLOAD_SIZE_BYTES below, not this one.
export const MAX_AVATAR_SOURCE_SIZE_BYTES = 15 * 1024 * 1024;

// The compressed file actually uploaded to Cloudinary. Kept at the same 5MB
// as every other upload in this app (and within next.config.ts's Server
// Action body limit) -- with the crop step now re-encoding as JPEG capped at
// a sane max dimension, a typical avatar lands well under 1MB, so this is a
// safety net rather than the everyday gate.
export const MAX_AVATAR_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

// Place gallery photos come straight from a phone camera roll (not cropped
// marketing images like the cover), so a more generous ceiling than the 5MB
// flyer cap. Enforced client-side (usePlaceGalleryUpload / mobile
// useManagePlace) AND baked into the signed Cloudinary upload params.
export const MAX_PLACE_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

// A highlight can be a short video, so this is the video ceiling (Cloudinary
// free-tier non-chunked upload tops out at 100MB). uploadHighlight.ts keeps
// a tighter 20MB sub-limit for the image case; this is the hard cap the
// signed Cloudinary upload params enforce for either media type.
export const MAX_HIGHLIGHT_UPLOAD_SIZE_BYTES = 90 * 1024 * 1024;

// Formats the signed Cloudinary upload signatures accept, by media class.
// Sent verbatim as the `allowed_formats` upload param (and included in the
// signature), so Cloudinary itself rejects anything else — the client can't
// widen this. Kept here so client-side pickers and the server signer agree.
export const ALLOWED_IMAGE_UPLOAD_FORMATS = "jpg,jpeg,png,webp,heic,heif";
export const ALLOWED_VIDEO_UPLOAD_FORMATS = "mp4,mov,webm,m4v,qt";
