// Shared across every event-flyer entry point (create and edit) plus
// saveEventFlyerToCloudinary.ts's server-side check, so the client-side
// rejection message and the server-side defense-in-depth check can never
// drift apart. Mirrors useAvatarUpload.ts's existing 5MB avatar limit —
// event flyers are marketing images, not raw phone-camera photos, so the
// same cap is appropriate. Kept under the 5MB Server Action body limit
// (next.config.ts) since flyers still go through saveEventFlyerToCloudinary
// as a raw File argument, same as avatars.
export const MAX_EVENT_FLYER_SIZE_BYTES = 5 * 1024 * 1024;
