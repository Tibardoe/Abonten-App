// Shared by eventSchema.ts and placeSchema.ts so the two Website inputs
// validate identically instead of maintaining two copies of the same regex.
export const WEBSITE_URL_REGEX =
  /^((https?:\/\/)?(www\.)?[a-zA-Z0-9\-]+\.[a-z]{2,})(\/\S*)?$/;
