import {
  PostImage,
  StoryImage,
  WelcomeImage,
} from "@/shareKit/server/ShareImageLayouts";
import { loadShareCard } from "@/shareKit/server/loadShareCard";
import { loadShareAssets } from "@/shareKit/server/shareAssets";
import {
  SHARE_CACHE_MISS,
  SHARE_CACHE_OK,
  shareLocale,
  sharePlainResponse,
  shareRateLimited,
} from "@/shareKit/server/shareRoute";
import { logger } from "@abonten/core/logger";
import {
  SHARE_IMAGE_SIZES,
  isShareFormatFor,
  isShareSubjectKind,
} from "@abonten/core/shareKit/shareKit";
import { ImageResponse } from "next/og";

// GET /api/share/<events|places|profiles>/<code|slug|username>/<story|post|welcome>?hl=<locale>
//
// The share kit's images (packages/core/src/shareKit/shareKit.ts): a PNG an
// organizer or place owner downloads from their manage page or the app and
// posts to their own socials. Public facts only, read like the public pages,
// so the image may be cached by the CDN; an edit shows within the hour.
// Not behind the proxy (no cookie is needed or read).

const KEY_PATTERN = /^[A-Za-z0-9._-]{1,120}$/;

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
    return sharePlainResponse(404, "Not found", SHARE_CACHE_MISS);
  }
  const locale = shareLocale(req);

  if (await shareRateLimited(req)) {
    return sharePlainResponse(429, "Too many requests");
  }

  try {
    const assets = await loadShareAssets();
    const result = await loadShareCard(kind, key, format, locale, assets);
    if (result.kind === "not_found") {
      return sharePlainResponse(404, "Not found", SHARE_CACHE_MISS);
    }

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
      headers: { "Cache-Control": SHARE_CACHE_OK },
    });
  } catch (error) {
    logger.error("Share image failed", {
      kind,
      format,
      error: error instanceof Error ? error.message : String(error),
    });
    return sharePlainResponse(500, "The image could not be made right now.");
  }
}
