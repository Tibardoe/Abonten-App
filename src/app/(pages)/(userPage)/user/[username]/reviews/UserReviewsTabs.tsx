"use client";

import { cn } from "@/components/lib/utils";
import type { PaginatedResult } from "@/types/pagination";
import { useState } from "react";
import PlaceReviewsList from "./PlaceReviewsList";
import UserReviewsList from "./UserReviewsList";

type Tab = "event" | "place";

// Tab switcher between reviews written ABOUT this user as an event
// organizer (existing behavior, unchanged) and reviews of places this user
// owns/manages (new) -- mirrors DraftsView.tsx's tab pattern for the same
// "two related but differently-shaped lists" problem.
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
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          className={cn(
            "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors",
            activeTab === "event"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveTab("event")}
        >
          Event Reviews
        </button>
        <button
          type="button"
          className={cn(
            "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors",
            activeTab === "place"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveTab("place")}
        >
          Place Reviews
        </button>
      </div>

      {activeTab === "event" && (
        <UserReviewsList
          queryKey={eventReviewsQueryKey}
          initialPage={eventReviewsInitialPage}
          fetchPage={fetchEventReviewsPage}
          emptyState={eventReviewsEmptyState}
        />
      )}

      {activeTab === "place" && (
        <PlaceReviewsList
          queryKey={placeReviewsQueryKey}
          initialPage={placeReviewsInitialPage}
          fetchPage={fetchPlaceReviewsPage}
          emptyState={placeReviewsEmptyState}
        />
      )}
    </div>
  );
}
