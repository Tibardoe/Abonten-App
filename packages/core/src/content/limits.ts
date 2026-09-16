// Client-side media limits for Spotlight + Stories. The server re-checks
// every one of them against Cloudinary's own record of the upload, so these
// only decide what the picker refuses up front.

export const MAX_CONTENT_VIDEO_BYTES = 90 * 1024 * 1024;
export const MAX_CONTENT_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_CAPTION_LENGTH = 2200;
export const MAX_COMMENT_LENGTH = 1000;
/** Fallbacks when the programme settings have not loaded. */
export const DEFAULT_SPOTLIGHT_VIDEO_MAX_SECONDS = 90;
export const DEFAULT_STORY_VIDEO_MAX_SECONDS = 60;
export const MIN_VIDEO_SECONDS = 1;
