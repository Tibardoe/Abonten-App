"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PaginatedResult } from "@/types/pagination";
import { useState } from "react";
import PlaceReviewsList from "./PlaceReviewsList";
import UserReviewsList from "./UserReviewsList";

type Tab = "event" | "place";

function isTab(value: string): value is Tab {
  return value === "event" || value === "place";
}

// Tab switcher between reviews written ABOUT this user as an event
// organizer (existing behavior, unchanged) and reviews of places this user
// owns/manages (new) -- uses the same shared Tabs primitive and centered
// pill styling as ExploreTabs.tsx/MyEventsTabs.tsx for cross-page
// consistency.
export default function UserReviewsTabs({
  eventReviewsQueryKey,
  eventReviewsInitialPage,
  fetchEventReviewsPage,
  eventReviewsEmptyState,
  placeReviewsQueryKey,
  placeReviewsInitialPage,
  fetchPlaceReviewsPage,
  placeReviewsEmptyState,
}: {
  eventReviewsQueryKey: unknown[];
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  eventReviewsInitialPage: PaginatedResult<any>;
  fetchEventReviewsPage: (
    cursor: string | null,
    // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  ) => Promise<PaginatedResult<any>>;
  eventReviewsEmptyState: React.ReactNode;
  placeReviewsQueryKey: unknown[];
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  placeReviewsInitialPage: PaginatedResult<any>;
  fetchPlaceReviewsPage: (
    cursor: string | null,
    // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  ) => Promise<PaginatedResult<any>>;
  placeReviewsEmptyState: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("event");

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => isTab(value) && setActiveTab(value)}
    >
      <div className="flex justify-center">
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-grid md:min-w-[240px]">
          <TabsTrigger value="event">Event Reviews</TabsTrigger>
          <TabsTrigger value="place">Place Reviews</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="event">
        <UserReviewsList
          queryKey={eventReviewsQueryKey}
          initialPage={eventReviewsInitialPage}
          fetchPage={fetchEventReviewsPage}
          emptyState={eventReviewsEmptyState}
        />
      </TabsContent>

      <TabsContent value="place">
        <PlaceReviewsList
          queryKey={placeReviewsQueryKey}
          initialPage={placeReviewsInitialPage}
          fetchPage={fetchPlaceReviewsPage}
          emptyState={placeReviewsEmptyState}
        />
      </TabsContent>
    </Tabs>
  );
}
