import type { CoreTranslator } from "./i18n/translator";

// Server Actions previously trusted whatever address/latitude/longitude the
// client sent for event/place creation and editing with no validation at
// all. This is a cheap shape/range check (not a re-geocode) -- catches
// manipulated, stale, or malformed client state without adding a billed
// Google API call or extra latency to every submission.
export function validateLocationInput(
  t: CoreTranslator,
  input: {
    address: string;
    latitude: number;
    longitude: number;
  },
): { valid: true } | { valid: false; message: string } {
  const invalidMessage = {
    valid: false as const,
    message: t("location.invalid"),
  };

  if (!input.address || !input.address.trim()) return invalidMessage;
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude))
    return invalidMessage;
  if (Math.abs(input.latitude) > 90 || Math.abs(input.longitude) > 180)
    return invalidMessage;

  return { valid: true };
}
