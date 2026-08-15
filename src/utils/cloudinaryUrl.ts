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
};

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
  { width, height, lossless = false }: CloudinaryImageOptions,
): string {
  const targetWidth = Math.round(width * 2); // 2x for retina displays
  const transformParts = lossless ? [] : ["q_auto", "f_auto"];
  transformParts.push(`w_${targetWidth}`);

  if (height) {
    transformParts.push(`h_${Math.round(height * 2)}`, "c_fill");
  } else {
    transformParts.push("c_limit");
  }

  return `${CLOUDINARY_BASE_URL}${transformParts.join(",")}/v${version}/${publicId}.jpg`;
}
