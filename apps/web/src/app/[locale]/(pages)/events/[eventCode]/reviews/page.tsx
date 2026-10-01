import { publicSupabase } from "@/config/supabase/publicClient";
import AddEventReviewButton from "@/events/molecules/AddEventReviewButton";
import { loadReviewsPage, reviewsPageDescription } from "@/reviews/loadReviews";
import ReviewsBrowser from "@/reviews/organisms/ReviewsBrowser";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { reviewsPath } from "@abonten/core/reviews/reviewList";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

// /events/<code>/reviews — every review of one event: breakdown, star
// filters, sorting and infinite scroll (ReviewsBrowser). ?review=<id> is a
// shared link: that review is pinned first, and the page's link preview
// quotes it. The segment layout has already 404'd an unknown code.

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

async function loadEvent(eventCode: string) {
  const { data } = await publicSupabase
    .from("event")
    .select(
      "id, title, event_code, organizer_id, status, starts_at, ends_at, flyer_public_id, flyer_version, event_occurrence(id, starts_at, ends_at)",
    )
    .eq("event_code", eventCode.toUpperCase())
    .maybeSingle();
  return data;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ eventCode: string }>;
  searchParams: Promise<{ review?: string | string[] }>;
}): Promise<Metadata> {
  const [{ eventCode }, { review }] = await Promise.all([params, searchParams]);
  const event = await loadEvent(eventCode);
  if (!event) return { title: "Event not found" };

  const title = `Reviews of ${event.title}`;
  const description = await reviewsPageDescription(
    "event",
    event.id,
    event.title,
    review,
  );
  const image =
    event.flyer_public_id && event.flyer_version
      ? buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
          width: 1200,
          height: 630,
        })
      : undefined;
  return {
    title,
    description,
    alternates: { canonical: reviewsPath("event", event.event_code) },
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
  params: Promise<{ eventCode: string }>;
  searchParams: Promise<{ review?: string | string[] }>;
}) {
  const [{ eventCode }, { review }] = await Promise.all([params, searchParams]);
  const event = await loadEvent(eventCode);
  if (!event) notFound();

  const initial = await loadReviewsPage("event", event.id, review);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-12">
      <div className="space-y-1">
        <Link
          href={`/events/${event.event_code}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {event.title}
        </Link>
        <h1 className="text-2xl font-bold md:text-3xl">Reviews</h1>
      </div>

      <ReviewsBrowser
        subject={{
          kind: "event",
          id: event.id,
          slug: event.event_code,
          title: event.title,
          ownerId: event.organizer_id,
        }}
        initialSummary={initial.summary}
        initialPage={initial.page}
        sharedReviewId={initial.sharedReviewId}
        initialShared={initial.shared}
        addReviewButton={
          <AddEventReviewButton
            eventId={event.id}
            organizerId={event.organizer_id}
            eventStatus={event.status}
            startsAt={event.starts_at}
            endsAt={event.ends_at}
            occurrences={event.event_occurrence}
          />
        }
      />
    </div>
  );
}
