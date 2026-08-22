"use client";

import { getEventDrafts } from "@/actions/getEventDrafts";
import type { EventDraftListItem } from "@/actions/getEventDrafts";
import { getPlaceDrafts } from "@/actions/getPlaceDrafts";
import type { PlaceDraftListItem } from "@/actions/getPlaceDrafts";
import { getReviewDrafts } from "@/actions/getReviewDrafts";
import type { ReviewDraftListItem } from "@/actions/getReviewDrafts";
import PostButton from "@/components/atoms/PostButton";
import { cn } from "@/components/lib/utils";
import EventDraftCard from "@/components/molecules/EventDraftCard";
import PlaceDraftCard from "@/components/molecules/PlaceDraftCard";
import ReviewDraftCard from "@/components/molecules/ReviewDraftCard";
import { useState } from "react";

type DraftsViewProps = {
  initialEventDrafts: EventDraftListItem[];
  initialReviewDrafts: ReviewDraftListItem[];
  initialPlaceDrafts: PlaceDraftListItem[];
};

type Tab = "event" | "review" | "place";

export default function DraftsView({
  initialEventDrafts,
  initialReviewDrafts,
  initialPlaceDrafts,
}: DraftsViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("event");
  const [eventDrafts, setEventDrafts] = useState(initialEventDrafts);
  const [reviewDrafts, setReviewDrafts] = useState(initialReviewDrafts);
  const [placeDrafts, setPlaceDrafts] = useState(initialPlaceDrafts);

  // Re-fetch-and-replace, mirroring the local-state approach already used
  // for delete (onDeleted below). Save-and-close and publish only ever call
  // router.refresh(), which re-renders this component's Server Component
  // parent with fresh initial*Drafts props — but useState(initial*Drafts)
  // above only reads its initial value once, so those new props are
  // silently dropped and the list stays stale.
  const refreshEventDrafts = async () => {
    const response = await getEventDrafts();
    if (response.status === 200) setEventDrafts(response.data);
  };

  const refreshReviewDrafts = async () => {
    const response = await getReviewDrafts();
    if (response.status === 200) setReviewDrafts(response.data);
  };

  const refreshPlaceDrafts = async () => {
    const response = await getPlaceDrafts();
    if (response.status === 200) setPlaceDrafts(response.data);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "event", label: "Event Drafts" },
    { id: "place", label: "Place Drafts" },
    { id: "review", label: "Review Drafts" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "event" && (
        <div className="space-y-4">
          {eventDrafts.length === 0 ? (
            <div className="text-center space-y-4 py-10">
              <p className="text-muted-foreground">No event drafts yet.</p>
              <PostButton />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {eventDrafts.map((draft) => (
                <EventDraftCard
                  key={draft.id}
                  draft={draft}
                  onDeleted={(id) =>
                    setEventDrafts((prev) => prev.filter((d) => d.id !== id))
                  }
                  onDraftListChanged={refreshEventDrafts}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "place" && (
        <div className="space-y-4">
          {placeDrafts.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">
              No place drafts yet.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {placeDrafts.map((draft) => (
                <PlaceDraftCard
                  key={draft.id}
                  draft={draft}
                  onDeleted={(id) =>
                    setPlaceDrafts((prev) => prev.filter((d) => d.id !== id))
                  }
                  onDraftListChanged={refreshPlaceDrafts}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "review" && (
        <div className="space-y-4">
          {reviewDrafts.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">
              No review drafts yet.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {reviewDrafts.map((draft) => (
                <ReviewDraftCard
                  key={draft.id}
                  draft={draft}
                  onDeleted={(id) =>
                    setReviewDrafts((prev) => prev.filter((d) => d.id !== id))
                  }
                  onDraftListChanged={refreshReviewDrafts}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
