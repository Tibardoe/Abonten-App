import { getPublicWeeklyEdition } from "@/utils/weeklyPublic";
import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import {
  WEEKLY_PRODUCT_NAME,
  WEEKLY_TAGLINE,
  weeklyEditionPath,
} from "@abonten/core/weekly/copy";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WeeklyEditionView from "./WeeklyEditionView";
import WeeklyFallback from "./WeeklyFallback";
import WeeklyPersonalEdition from "./WeeklyPersonalEdition";

// Shared body of /weekly, /weekly/[scope] and /weekly/[scope]/[week].
//
// Renders from the anonymous read, so the result is the same for everyone
// and the route can be cached. When the programme is open to everyone the
// edition is in the HTML (fast, shareable, indexable). While it is open to
// staff or beta only, the HTML holds nothing but a client component that
// loads the edition with the visitor's session.

export async function WeeklyPage({
  scope,
  week,
}: {
  scope: string | null;
  week: string | null;
}) {
  const result = await getPublicWeeklyEdition(scope, week);
  const data = result.data;

  if (!data?.available) {
    return <WeeklyPersonalEdition scope={scope} week={week} />;
  }
  if (data.edition) return <WeeklyEditionView doc={data.edition} />;
  if (result.status === 404) notFound();
  return <WeeklyFallback events={data.fallbackEvents} />;
}

const siteOrigin = () =>
  (process.env.NEXT_PUBLIC_BASE_URL || PUBLIC_SITE_ORIGIN).replace(/\/+$/, "");

export async function weeklyMetadata(
  scope: string | null,
  week: string | null,
): Promise<Metadata> {
  const result = await getPublicWeeklyEdition(scope, week);
  const doc = result.data?.edition;

  if (!doc) {
    // Nothing public to describe: never index an empty or staff-only page.
    return {
      title: `${WEEKLY_PRODUCT_NAME} | Abonten Hub`,
      description: WEEKLY_TAGLINE,
      robots: { index: false, follow: true },
    };
  }

  const e = doc.edition;
  const canonicalPath = weeklyEditionPath(e.scopeSlug, e.weekStart);
  const title = `${e.title} · ${WEEKLY_PRODUCT_NAME} ${e.scopeName} | Abonten Hub`;
  const description = (e.subtitle ?? e.intro ?? WEEKLY_TAGLINE).slice(0, 155);
  const firstImage = doc.sections
    .flatMap((s) => s.items)
    .map((i) =>
      i.event?.flyer_public_id
        ? { id: i.event.flyer_public_id, v: i.event.flyer_version }
        : i.place?.cover_public_id
          ? { id: i.place.cover_public_id, v: i.place.cover_version }
          : null,
    )
    .find(Boolean);
  const image = firstImage
    ? buildCloudinaryUrl(firstImage.id, firstImage.v, {
        width: 1200,
        height: 630,
      })
    : undefined;

  return {
    title,
    description,
    alternates: { canonical: `${siteOrigin()}${canonicalPath}` },
    openGraph: {
      title,
      description,
      type: "article",
      url: `${siteOrigin()}${canonicalPath}`,
      images: image ? [{ url: image, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}
