import { describe, expect, it } from "vitest";
import { isUploadSignatureKind } from "./cloudinaryUploadSignature";

// buildCloudinaryUploadSignature itself needs a live Supabase client (for
// checkRateLimit) and real Cloudinary env vars, so it's an integration
// concern, not a unit one -- this covers the one pure guard in the module.
describe("isUploadSignatureKind", () => {
  it("accepts every known kind", () => {
    for (const kind of [
      "avatar",
      "highlight",
      "place_photo",
      "event_flyer",
      "event_review_photo",
      "place_review_photo",
    ]) {
      expect(isUploadSignatureKind(kind)).toBe(true);
    }
  });

  it("rejects an unknown string", () => {
    expect(isUploadSignatureKind("not_a_real_kind")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isUploadSignatureKind(undefined)).toBe(false);
    expect(isUploadSignatureKind(null)).toBe(false);
    expect(isUploadSignatureKind(123)).toBe(false);
    expect(isUploadSignatureKind({})).toBe(false);
  });
});
