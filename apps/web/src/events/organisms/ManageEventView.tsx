"use client";

import CheckInByCodeCard from "@/events/molecules/CheckInByCodeCard";
import ManageEventShowsCard from "@/events/molecules/ManageEventShowsCard";
import PromoterCommissionCard from "@/events/molecules/PromoterCommissionCard";
import ManageEventDetailsSection from "@/events/organisms/ManageEventDetailsSection";
import ManageEventInsightsSection from "@/events/organisms/ManageEventInsightsSection";
import ManageEventPromotionSection from "@/events/organisms/ManageEventPromotionSection";
import ShareKitCard from "@/shareKit/organisms/ShareKitCard";
import PaySmallSmallCard from "@/ticketPlans/molecules/PaySmallSmallCard";
import TicketTransferOrganizerCard from "@/ticketTransfers/molecules/TicketTransferOrganizerCard";
import type { EventStatus } from "@abonten/core/eventStatus";
import { hasShareImages } from "@abonten/core/shareKit/shareKit";
import { teamRoleCan } from "@abonten/core/teams/roles";
import type { ManagedEvent } from "@abonten/types/managedEventType";
import type { TeamRoleCode } from "@abonten/types/teamType";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import ManageEventAttendeesSection from "./ManageEventAttendeesSection";

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
  /** The person's role when managing as a team; null for their own event. */
  teamRole: TeamRoleCode | null;
};

const TEAM_TABS: { id: Tab; label: string }[] = [
  { id: "attendees", label: "tabs.attendees" },
  { id: "checkin", label: "tabs.checkin" },
];

type Tab = "details" | "promotion" | "insights" | "attendees" | "checkin";

const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "tabs.details" },
  { id: "promotion", label: "tabs.promotion" },
  { id: "insights", label: "tabs.insights" },
];

// Managing as a team: what the role covers (details for Managers, the
// attendee list or check-in for those at the door, featuring and the
// promoter commission for Owners and Finance, the Pay small small and
// sending switches for Managers, sales and earnings for Owners and Finance).
function tabsFor(role: TeamRoleCode | null): Tab[] {
  if (!role) return ["details", "promotion", "insights"];
  const tabs: Tab[] = [];
  if (teamRoleCan(role, "events.manage")) tabs.push("details");
  if (teamRoleCan(role, "attendees.view")) tabs.push("attendees");
  else if (teamRoleCan(role, "checkin.scan")) tabs.push("checkin");
  if (teamRoleCan(role, "promotions.buy") || teamRoleCan(role, "events.manage"))
    tabs.push("promotion");
  if (teamRoleCan(role, "money.view")) tabs.push("insights");
  return tabs;
}

/** Whether the person may use this part of the event as the team. */
function covers(
  role: TeamRoleCode | null,
  capability: "promotions.buy" | "events.manage",
) {
  return !role || teamRoleCan(role, capability);
}

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
  teamRole,
}: ManageEventViewProps) {
  const t = useTranslations("events");
  const router = useRouter();
  const searchParams = useSearchParams();

  const allowed = tabsFor(teamRole);
  const requestedTab = searchParams.get("tab") as Tab | null;
  const initialTab: Tab =
    requestedTab && allowed.includes(requestedTab)
      ? requestedTab
      : (allowed[0] ?? "details");

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
        {[...TABS, ...TEAM_TABS]
          .filter((tab) => allowed.includes(tab.id))
          .map((tab) => (
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
              {t(tab.label)}
            </button>
          ))}
      </div>

      <div className="w-full md:w-[70%] md:mx-auto">
        {activeTab === "details" && (
          <>
            <ManageEventDetailsSection
              event={event}
              hasConfirmedParticipation={hasConfirmedParticipation}
              onSaved={refresh}
            />
            {event.status === "published" && (
              <div className="mt-8">
                <ManageEventShowsCard
                  eventId={event.id}
                  timeZone={event.timezone}
                  startsAt={event.starts_at}
                  endsAt={event.ends_at}
                />
              </div>
            )}
          </>
        )}

        {activeTab === "promotion" && (
          <>
            <ShareKitCard
              kind="events"
              subjectKey={event.event_code}
              name={event.title}
              isPublic={hasShareImages(event)}
            />
            {covers(teamRole, "promotions.buy") ? (
              <>
                <ManageEventPromotionSection
                  eventId={event.id}
                  tiers={promotionTiers}
                  currentPromotion={currentPromotion}
                  eventStatus={event.status}
                  derivedStatus={derivedStatus}
                  soldOut={soldOut}
                />
                <PromoterCommissionCard eventId={event.id} />
              </>
            ) : null}
            {covers(teamRole, "events.manage") ? (
              <>
                <PaySmallSmallCard eventId={event.id} />
                <TicketTransferOrganizerCard eventId={event.id} />
              </>
            ) : null}
          </>
        )}

        {activeTab === "insights" && (
          <ManageEventInsightsSection eventId={event.id} />
        )}

        {activeTab === "attendees" && (
          <ManageEventAttendeesSection eventId={event.id} />
        )}

        {activeTab === "checkin" && <CheckInByCodeCard eventId={event.id} />}
      </div>
    </div>
  );
}
