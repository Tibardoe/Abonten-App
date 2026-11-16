import { defaultLocale, isLocale } from "@/i18n/config";
import {
  PostImage,
  StoryImage,
  WelcomeImage,
} from "@/shareKit/server/ShareImageLayouts";
import { loadShareCard } from "@/shareKit/server/loadShareCard";
import { loadShareAssets } from "@/shareKit/server/shareAssets";
import { logger } from "@abonten/core/logger";
import {
  SHARE_IMAGE_SIZES,
  isShareFormatFor,
  isShareSubjectKind,
} from "@abonten/core/shareKit/shareKit";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import { ImageResponse } from "next/og";

// GET /api/share/<events|places|profiles>/<code|slug|username>/<story|post|welcome>?hl=<locale>
//
// The share kit's images (packages/core/src/shareKit/shareKit.ts): a PNG an
// organizer or place owner downloads from their manage page or the app and
// posts to their own socials. Public facts only, read like the public pages,
// so the image may be cached by the CDN; an edit shows within the hour.
// Not behind the proxy (no cookie is needed or read).

const KEY_PATTERN = /^[A-Za-z0-9._-]{1,120}$/;
const CACHE_OK =
  "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";
const CACHE_MISS = "public, max-age=60, s-maxage=300";

/** Images per visitor per minute, after the CDN cache. */
const IMAGES_PER_MINUTE = 40;

function plain(status: number, body: string, cache = "no-store") {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": cache,
    },
  });
}

export async function GET(
  req: Request,
  {
    params,
  }: { params: Promise<{ kind: string; key: string; format: string }> },
) {
  const { kind, key, format } = await params;
  if (
    !isShareSubjectKind(kind) ||
    !isShareFormatFor(kind, format) ||
    !KEY_PATTERN.test(key)
  ) {
    return plain(404, "Not found", CACHE_MISS);
  }
  const hl = new URL(req.url).searchParams.get("hl");
  const locale = isLocale(hl) ? hl : defaultLocale;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (
    ip &&
    !(await checkRateLimit(`share-image:${ip}`, IMAGES_PER_MINUTE, 60))
  ) {
    return plain(429, "Too many requests");
  }

  try {
    const assets = await loadShareAssets();
    const result = await loadShareCard(kind, key, format, locale, assets);
    if (result.kind === "not_found") return plain(404, "Not found", CACHE_MISS);

    const size = SHARE_IMAGE_SIZES[format];
    const element =
      result.kind === "welcome" ? (
        <WelcomeImage card={result.card} />
      ) : format === "story" ? (
        <StoryImage card={result.card} />
      ) : (
        <PostImage card={result.card} />
      );
    return new ImageResponse(element, {
      width: size.width,
      height: size.height,
      fonts: assets.fonts,
      headers: { "Cache-Control": CACHE_OK },
    });
  } catch (error) {
    logger.error("Share image failed", {
      kind,
      format,
      error: error instanceof Error ? error.message : String(error),
    });
    return plain(500, "The image could not be made right now.");
  }
}
