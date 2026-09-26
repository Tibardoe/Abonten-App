const CLOUDINARY_BASE_URL = "https://res.cloudinary.com/abonten/image/upload/";

type CloudinaryImageOptions = {
  /** Rendered width in CSS px. A transformation is requested at 2x this for retina. */
  width: number;
  /** Rendered height in CSS px, if the image is cropped to a fixed box (e.g. an avatar). */
  height?: number;
  /**
   * Skip q_auto/f_auto lossy compression — for images where exactness
   * matters more than payload size (namely QR codes, where compression
   * artifacts on the fine pixel pattern risk making it unscannable).
   */
  lossless?: boolean;
  /**
   * Image Cloudinary serves instead when this one no longer exists (its
   * `d_` parameter): a public id with ":" for "/" and a format extension.
   * Defaults to the neutral branded placeholder; QR codes (`lossless`) get
   * none, because a placeholder must never stand in for a scannable code.
   */
  fallback?: string | null;
};

/**
 * The neutral branded placeholder (grey square, logo tile in the middle),
 * uploaded 2026-09-26. Fourteen past events lost their flyer files before
 * the draft clean-up was fixed; without this they rendered as broken
 * images on every card, ticket and receipt that showed them.
 */
export const IMAGE_FALLBACK_ID = "branding:image-fallback.png";

/**
 * Builds a Cloudinary delivery URL with a size/quality transformation, so
 * the origin serves an appropriately-sized asset instead of the full
 * original (flyers in particular can be far larger than any card/hero
 * actually renders them at). `q_auto,f_auto` lets Cloudinary pick the best
 * quality/format (e.g. WebP/AVIF) for the requesting browser.
 */
export function buildCloudinaryUrl(
  publicId: string | null | undefined,
  version: string | number | null | undefined,
  { width, height, lossless = false, fallback }: CloudinaryImageOptions,
): string {
  const targetWidth = Math.round(width * 2); // 2x for retina displays
  const transformParts = lossless ? [] : ["q_auto", "f_auto"];
  transformParts.push(`w_${targetWidth}`);

  if (height) {
    transformParts.push(`h_${Math.round(height * 2)}`, "c_fill");
  } else {
    transformParts.push("c_limit");
  }

  const defaultImage =
    fallback === undefined ? (lossless ? null : IMAGE_FALLBACK_ID) : fallback;
  if (defaultImage) transformParts.push(`d_${defaultImage}`);

  return `${CLOUDINARY_BASE_URL}${transformParts.join(",")}/v${version}/${publicId}.jpg`;
}

/** The shared "no photo yet" avatar every surface falls back to. */
export const DEFAULT_AVATAR = {
  publicId: "AnonymousProfile_rn6qez",
  version: "1743533914",
} as const;

/**
 * A person's avatar at a size, or the default avatar when they have none —
 * never a `/vnull/null.jpg` URL that 404s.
 */
export function buildAvatarUrl(
  publicId: string | null | undefined,
  version: string | number | null | undefined,
  options: CloudinaryImageOptions,
): string {
  // A photo that has since been deleted falls back to the same default
  // avatar as having none, not to the generic placeholder.
  const withDefault = {
    fallback: `${DEFAULT_AVATAR.publicId}.jpg`,
    ...options,
  };
  return publicId
    ? buildCloudinaryUrl(publicId, version ?? 1, withDefault)
    : buildCloudinaryUrl(
        DEFAULT_AVATAR.publicId,
        DEFAULT_AVATAR.version,
        withDefault,
      );
}
