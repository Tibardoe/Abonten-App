"use client";

import ManageEventDetailsSection from "@/events/organisms/ManageEventDetailsSection";
import ManageEventInsightsSection from "@/events/organisms/ManageEventInsightsSection";
import ManageEventPromotionSection from "@/events/organisms/ManageEventPromotionSection";
import type { EventStatus } from "@abonten/core/eventStatus";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md) — same convention every other manage-page view in this codebase uses for a joined/raw row (see ManagePlaceView.tsx)
type ManagedEvent = any;

type ManageEventViewProps = {
  event: ManagedEvent;
  hasConfirmedParticipation: boolean;
  promotionTiers: {
    id: number;
    duration_label: string;
    duration: string;
    price: number;
    currency: string;
    is_active: boolean;
  }[];
  currentPromotion: { ends_at: string; tier_label: string | null } | null;
  derivedStatus: EventStatus | null;
  soldOut: boolean;
};

type Tab = "details" | "promotion" | "insights";

const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "promotion", label: "Promotion" },
  { id: "insights", label: "Insights" },
];

// Top-level management view for a single event, tabbed across Details,
// Promotion and Insights — the direct mirror of ManagePlaceView.tsx (same
// hand-rolled tab bar styling, same `refresh = () => router.refresh()`
// convention passed down as the shared "something changed, re-fetch this
// Server Component's data" callback).
export default function ManageEventView({
  event,
  hasConfirmedParticipation,
  promotionTiers,
  currentPromotion,
  derivedStatus,
  soldOut,
}: ManageEventViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedTab = searchParams.get("tab");
  const initialTab: Tab =
    requestedTab === "promotion" || requestedTab === "insights"
      ? requestedTab
      : "details";

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const refresh = () => router.refresh();

  const eventAddress =
    (event.address as { full_address?: string })?.full_address ?? "";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-bold md:text-xl">{event.title}</h1>
        <p className="text-sm text-muted-foreground">{eventAddress}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-border pb-px md:justify-center">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-3 py-2 text-sm border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="w-full md:w-[70%] md:mx-auto">
        {activeTab === "details" && (
          <ManageEventDetailsSection
            event={event}
            hasConfirmedParticipation={hasConfirmedParticipation}
            onSaved={refresh}
          />
        )}

        {activeTab === "promotion" && (
          <ManageEventPromotionSection
            eventId={event.id}
            tiers={promotionTiers}
            currentPromotion={currentPromotion}
            eventStatus={event.status}
            derivedStatus={derivedStatus}
            soldOut={soldOut}
          />
        )}

        {activeTab === "insights" && (
          <ManageEventInsightsSection eventId={event.id} />
        )}
      </div>
    </div>
  );
}
