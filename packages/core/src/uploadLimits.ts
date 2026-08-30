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
