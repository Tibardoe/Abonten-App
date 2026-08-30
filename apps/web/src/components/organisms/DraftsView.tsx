"use client";

import { getEventDrafts } from "@/actions/getEventDrafts";
import type { EventDraftListItem } from "@/actions/getEventDrafts";
import { getPlaceDrafts } from "@/actions/getPlaceDrafts";
import type { PlaceDraftListItem } from "@/actions/getPlaceDrafts";
import { getReviewDrafts } from "@/actions/getReviewDrafts";
import type { ReviewDraftListItem } from "@/actions/getReviewDrafts";
import PostButton from "@/components/atoms/PostButton";
import EventDraftCard from "@/components/molecules/EventDraftCard";
import PlaceDraftCard from "@/components/molecules/PlaceDraftCard";
import ReviewDraftCard from "@/components/molecules/ReviewDraftCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/useToast";
import { useState } from "react";

type DraftsViewProps = {
  initialEventDrafts: EventDraftListItem[];
  initialReviewDrafts: ReviewDraftListItem[];
  initialPlaceDrafts: PlaceDraftListItem[];
};

type Tab = "event" | "review" | "place";

function isTab(value: string): value is Tab {
  return value === "event" || value === "review" || value === "place";
}

export default function DraftsView({
  initialEventDrafts,
  initialReviewDrafts,
  initialPlaceDrafts,
}: DraftsViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("event");
  const [eventDrafts, setEventDrafts] = useState(initialEventDrafts);
  const [reviewDrafts, setReviewDrafts] = useState(initialReviewDrafts);
  const [placeDrafts, setPlaceDrafts] = useState(initialPlaceDrafts);
  const toast = useToast();

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

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => isTab(value) && setActiveTab(value)}
    >
      <div className="flex justify-center">
        <TabsList className="grid w-full grid-cols-3 md:w-auto md:inline-grid md:min-w-[360px]">
          <TabsTrigger value="event">Event Drafts</TabsTrigger>
          <TabsTrigger value="place">Place Drafts</TabsTrigger>
          <TabsTrigger value="review">Review Drafts</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="event">
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
                  onRestoreDraft={(restored) =>
                    setEventDrafts((prev) => [restored, ...prev])
                  }
                  onDeleteError={toast.error}
                  onDraftListChanged={refreshEventDrafts}
                />
              ))}
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="place">
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
                  onRestoreDraft={(restored) =>
                    setPlaceDrafts((prev) => [restored, ...prev])
                  }
                  onDeleteError={toast.error}
                  onDraftListChanged={refreshPlaceDrafts}
                />
              ))}
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="review">
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
                  onRestoreDraft={(restored) =>
                    setReviewDrafts((prev) => [restored, ...prev])
                  }
                  onDeleteError={toast.error}
                  onDraftListChanged={refreshReviewDrafts}
                />
              ))}
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
