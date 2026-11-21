import { RoundupCoverImage } from "@/shareKit/server/ShareImageLayouts";
import { loadShareAssets } from "@/shareKit/server/shareAssets";
import {
  SHARE_CACHE_MISS,
  SHARE_CACHE_OK,
  shareLocale,
  sharePlainResponse,
  shareRateLimited,
} from "@/shareKit/server/shareRoute";
import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import { formatDateRange } from "@abonten/core/i18n/format";
import { logger } from "@abonten/core/logger";
import { cityPath } from "@abonten/core/seo/paths";
import {
  ROUNDUP_CITY,
  ROUNDUP_COVER_SIZE,
  parseRoundupKey,
} from "@abonten/core/social/roundups";
import { serverTranslator } from "@abonten/i18n/server";
import { ImageResponse } from "next/og";

// GET /api/share/roundups/<week|weekend>-<yyyy-mm-dd>/cover?hl=<locale>
//
// The cover of a weekly roundup Abonten posts on its own channels (Admin ›
// Social, docs/admin/social.md): "What's on in Accra" or "This weekend in
// Accra" with the days. Drawn like the share kit's listing images (same
// renderer, font, caching and limit); it reads no data, only the name, so
// any real week (from a Monday) or weekend (from a Friday) has a cover.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const roundup = parseRoundupKey(key);
  // Only the address form (week-2026-11-23) names a cover.
  if (!roundup || roundup.slug !== key) {
    return sharePlainResponse(404, "Not found", SHARE_CACHE_MISS);
  }
  const locale = shareLocale(req);
  if (await shareRateLimited(req)) {
    return sharePlainResponse(429, "Too many requests");
  }

  try {
    const assets = await loadShareAssets();
    const t = serverTranslator(locale, "server");
    const path = cityPath(ROUNDUP_CITY.slug);
    const card = {
      heading:
        roundup.kind === "week"
          ? t("shareKit.roundupWeekHeading")
          : t("shareKit.roundupWeekendHeading"),
      // Calendar days: drawn at midnight UTC and read in UTC, so the zone
      // of the server never moves them.
      dates: formatDateRange(
        `${roundup.start}T00:00:00Z`,
        `${roundup.end}T00:00:00Z`,
        locale,
        { day: "numeric", month: "long", timeZone: "UTC" },
      ),
      line: t("shareKit.roundupLine"),
      cta: t("shareKit.roundupCta"),
      displayUrl: `${PUBLIC_SITE_ORIGIN.replace(/^https?:\/\//, "")}${path}`,
      mark: assets.mark,
      wordmark: assets.wordmark,
    };
    return new ImageResponse(<RoundupCoverImage card={card} />, {
      width: ROUNDUP_COVER_SIZE.width,
      height: ROUNDUP_COVER_SIZE.height,
      fonts: assets.fonts,
      headers: { "Cache-Control": SHARE_CACHE_OK },
    });
  } catch (error) {
    logger.error("Roundup cover failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return sharePlainResponse(500, "The image could not be made right now.");
  }
}
