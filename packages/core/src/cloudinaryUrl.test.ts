import { describe, expect, it } from "vitest";
import {
  DEFAULT_AVATAR,
  IMAGE_FALLBACK_ID,
  buildAvatarUrl,
  buildCloudinaryUrl,
} from "./cloudinaryUrl";

describe("buildCloudinaryUrl", () => {
  it("asks Cloudinary for the branded placeholder when an image is missing", () => {
    const url = buildCloudinaryUrl("event_flyers/abc", "123", {
      width: 500,
      height: 224,
    });
    expect(url).toBe(
      `https://res.cloudinary.com/abonten/image/upload/q_auto,f_auto,w_1000,h_448,c_fill,d_${IMAGE_FALLBACK_ID}/v123/event_flyers/abc.jpg`,
    );
  });

  it("never substitutes a placeholder for a QR code", () => {
    const url = buildCloudinaryUrl("tickets_qr_codes/TKT-1", "9", {
      width: 224,
      height: 224,
      lossless: true,
    });
    expect(url).not.toContain("d_");
  });

  it("lets a caller choose its own fallback or none", () => {
    expect(
      buildCloudinaryUrl("x", 1, { width: 10, fallback: "other.png" }),
    ).toContain(",d_other.png/");
    expect(
      buildCloudinaryUrl("x", 1, { width: 10, fallback: null }),
    ).not.toContain("d_");
  });
});

describe("buildAvatarUrl", () => {
  it("falls back to the default avatar when the photo was deleted", () => {
    const url = buildAvatarUrl("user_profiles/u/p", 5, {
      width: 40,
      height: 40,
    });
    expect(url).toContain(`d_${DEFAULT_AVATAR.publicId}.jpg`);
    expect(url).toContain("/v5/user_profiles/u/p.jpg");
  });

  it("uses the default avatar outright when there is no photo", () => {
    const url = buildAvatarUrl(null, null, { width: 40, height: 40 });
    expect(url).toContain(
      `/v${DEFAULT_AVATAR.version}/${DEFAULT_AVATAR.publicId}.jpg`,
    );
  });
});
