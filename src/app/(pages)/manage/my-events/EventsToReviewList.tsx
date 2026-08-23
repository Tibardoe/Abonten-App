"use client";

import { getEventsAwaitingReview } from "@/actions/getEventsAwaitingReview";
import TicketCardSkeleton from "@/components/molecules/TicketCardSkeleton";
import EventReviewModal from "@/events/organisms/EventReviewModal";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const noEventsToReviewState = (
  <p className="text-center text-muted-foreground text-sm py-10">
    Nothing to review yet. Events you&apos;ve attended will show up here once
    they end.
  </p>
);

// The "rate your purchase" inbox this tab implements: every checked-in,
// ended, unreviewed event, each with a one-tap way into EventReviewModal
// (the same modal the Event Details page uses) so a review doesn't require
// navigating back to the event itself. An event drops out of this list the
// moment its review is submitted (query invalidation below) — there is
// deliberately no pagination, since a realistic backlog here is small,
// unlike the ticket-history tabs.
export default function EventsToReviewList() {
  const queryClient = useQueryClient();
  const [reviewingEventId, setReviewingEventId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["events-awaiting-review"],
    queryFn: () => getEventsAwaitingReview(),
  });

  const events = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="grid md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }, (_, i) => (
          <TicketCardSkeleton key={i.toLocaleString()} />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return noEventsToReviewState;
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      {events.map((event) => (
        <div
          key={event.id}
          className="bg-card text-card-foreground rounded-2xl shadow-md overflow-hidden border border-border"
        >
          <div className="relative h-48 w-full">
            <Image
              src={buildCloudinaryUrl(
                event.flyer_public_id,
                event.flyer_version,
                { width: 400, height: 192 },
              )}
              alt={event.title}
              fill
              className="object-cover rounded-t-2xl"
            />
          </div>
          <div className="p-4 space-y-3">
            <Link
              href={`/events/${event.event_code}#reviews`}
              className="text-lg font-semibold block"
            >
              {event.title}
            </Link>

            <p className="text-sm text-muted-foreground">How was this event?</p>

            <button
              type="button"
              onClick={() => setReviewingEventId(event.id)}
              className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
            >
              Write a Review
            </button>
          </div>

          {reviewingEventId === event.id && (
            <EventReviewModal
              eventId={event.id}
              handleShowReviewModal={(state) =>
                setReviewingEventId(state ? event.id : null)
              }
              onReviewSubmitted={() => {
                queryClient.invalidateQueries({
                  queryKey: ["events-awaiting-review"],
                });
                queryClient.invalidateQueries({
                  queryKey: ["user-event-reviews"],
                });
                queryClient.invalidateQueries({
                  queryKey: ["attending-events-counts"],
                });
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
