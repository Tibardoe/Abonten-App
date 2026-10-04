import { publicSupabase } from "@/config/supabase/publicClient";
import AddPlaceReviewButton from "@/places/molecules/AddPlaceReviewButton";
import { loadReviewsPage, reviewsPageDescription } from "@/reviews/loadReviews";
import ReviewsBrowser from "@/reviews/organisms/ReviewsBrowser";
import { rowOrFailure } from "@/utils/rowOrFailure";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { reviewsPath } from "@abonten/core/reviews/reviewList";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

// /places/<slug>/reviews — every review of one place: breakdown, star
// filters, sorting and infinite scroll (ReviewsBrowser). ?review=<id> is a
// shared link: that review is pinned first, and the page's link preview
// quotes it. The segment layout has already 404'd an unknown or unpublished
// slug.

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// The metadata and the page read the same row: one database read per
// request (React cache), not two.
const loadPlace = cache(async (slug: string) => {
  return rowOrFailure(
    await publicSupabase
      .from("place")
      .select("id, name, slug, owner_id, cover_public_id, cover_version")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle(),
    "place",
  );
});

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ review?: string | string[] }>;
}): Promise<Metadata> {
  const t = await getTranslations("places");

  const [{ slug }, { review }] = await Promise.all([params, searchParams]);
  const place = await loadPlace(slug);
  if (!place) return { title: t("placeNotFound") };

  const title = t("reviewsOf", { name: place.name });
  const description = await reviewsPageDescription(
    "place",
    place.id,
    place.name,
    review,
    await getLocale(),
  );
  const image =
    place.cover_public_id && place.cover_version
      ? buildCloudinaryUrl(place.cover_public_id, place.cover_version, {
          width: 1200,
          height: 630,
        })
      : undefined;
  return {
    title,
    description,
    alternates: { canonical: reviewsPath("place", place.slug) },
    openGraph: {
      title,
      description,
      type: "website",
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

export default async function page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ review?: string | string[] }>;
}) {
  const t = await getTranslations("places");

  const [{ slug }, { review }] = await Promise.all([params, searchParams]);
  const place = await loadPlace(slug);
  if (!place) notFound();

  const initial = await loadReviewsPage("place", place.id, review);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-12">
      <div className="space-y-1">
        <Link
          href={`/places/${place.slug}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {place.name}
        </Link>
        <h1 className="text-2xl font-bold md:text-3xl">{t("reviews")}</h1>
      </div>

      <ReviewsBrowser
        subject={{
          kind: "place",
          id: place.id,
          slug: place.slug,
          title: place.name,
          ownerId: place.owner_id,
        }}
        initialSummary={initial.summary}
        initialPage={initial.page}
        sharedReviewId={initial.sharedReviewId}
        initialShared={initial.shared}
        addReviewButton={
          <AddPlaceReviewButton placeId={place.id} ownerId={place.owner_id} />
        }
      />
    </div>
  );
}
