import { defaultLocale, isLocale } from "@/i18n/config";
import { checkRateLimit } from "@abonten/services/security/rateLimit";

// What every share-kit image route answers with (docs/architecture/
// share-kit.md): the CDN caching, the per-visitor limit and the plain-text
// errors, shared by the listing images and the roundup covers.

export const SHARE_CACHE_OK =
  "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";
export const SHARE_CACHE_MISS = "public, max-age=60, s-maxage=300";

/** Images per visitor per minute, after the CDN cache. */
const IMAGES_PER_MINUTE = 40;

export function sharePlainResponse(
  status: number,
  body: string,
  cache = "no-store",
): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": cache,
    },
  });
}

/** The image's language: `?hl=`, else English. */
export function shareLocale(req: Request): string {
  const hl = new URL(req.url).searchParams.get("hl");
  return isLocale(hl) ? hl : defaultLocale;
}

/** True when this visitor has drawn too many images this minute. */
export async function shareRateLimited(req: Request): Promise<boolean> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ip) return false;
  return !(await checkRateLimit(`share-image:${ip}`, IMAGES_PER_MINUTE, 60));
}
