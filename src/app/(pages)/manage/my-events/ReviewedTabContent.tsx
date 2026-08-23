"use client";

import { getUserEventReviews } from "@/actions/getUserEventReviews";
import { getUserPlaceReviews } from "@/actions/getUserPlaceReviews";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import ReviewedEventsList from "./ReviewedEventsList";
import ReviewedPlacesList from "./ReviewedPlacesList";

type ReviewedType = "events" | "places";

function isReviewedType(value: string): value is ReviewedType {
  return value === "events" || value === "places";
}

async function fetchReviewedEventsPage(cursor: string | null) {
  return getUserEventReviews({ cursor });
}

async function fetchReviewedPlacesPage(cursor: string | null) {
  return getUserPlaceReviews({ cursor });
}

// Nested Events/Places switcher inside the outer "Reviewed" tab -- same
// pattern UserReviewsTabs.tsx already uses for the profile page's own
// Event/Place review split. Both lists are always client-fetched (no
// server-seeded initial page), matching how every other My Tickets tab
// besides the initially-selected one already behaves -- simpler than
// threading a second tab dimension through page.tsx's server component for
// what is a secondary, nested view.
export default function ReviewedTabContent() {
  const [activeType, setActiveType] = useState<ReviewedType>("events");

  return (
    <Tabs
      value={activeType}
      onValueChange={(value) => isReviewedType(value) && setActiveType(value)}
    >
      <div className="flex justify-center">
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-grid md:min-w-[240px]">
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="places">Places</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="events">
        <ReviewedEventsList
          initialPage={null}
          fetchPage={fetchReviewedEventsPage}
        />
      </TabsContent>

      <TabsContent value="places">
        <ReviewedPlacesList
          initialPage={null}
          fetchPage={fetchReviewedPlacesPage}
        />
      </TabsContent>
    </Tabs>
  );
}
