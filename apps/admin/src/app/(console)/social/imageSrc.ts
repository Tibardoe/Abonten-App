import type { SocialQueueImage } from "@abonten/types/socialQueueType";

/**
 * The console's own address for one share image (see social/image/route.ts):
 * same origin, so a picture drawn on a canvas does not taint it.
 */
export function imageSrc(
  image: Pick<SocialQueueImage, "kind" | "key" | "format">,
  download = false,
): string {
  const q = new URLSearchParams({
    kind: image.kind,
    key: image.key,
    format: image.format,
  });
  if (download) q.set("download", "1");
  return `/social/image?${q.toString()}`;
}
