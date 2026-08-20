"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePathname, useSearchParams } from "next/navigation";
import { type ExploreTab, isExploreTab } from "../exploreTab";

// Generic tab switcher for the Explore page — mirrors
// src/app/(pages)/manage/my-events/MyEventsTabs.tsx's "?tab=" + shallow
// history-update pattern, but stays a thin shell: both tabs' content are
// already fully fetched/rendered server-side (see explore/[location]/page.tsx)
// and just handed in as children, so this component only owns tab
// switching, never fetching.
export default function ExploreTabs({
  initialTab,
  eventsContent,
  placesContent,
}: {
  initialTab: ExploreTab;
  eventsContent: React.ReactNode;
  placesContent: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentTab = isExploreTab(searchParams.get("tab") ?? undefined)
    ? (searchParams.get("tab") as ExploreTab)
    : initialTab;

  function handleTabChange(value: string) {
    if (!isExploreTab(value)) return;

    // Shallow URL update via the native History API — same reasoning as
    // MyEventsTabs.handleTabChange: keeps the tab bookmarkable/shareable
    // without triggering a server round-trip (which would re-run this
    // page's data fetches) on every click.
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange}>
      <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-grid md:min-w-[240px]">
        <TabsTrigger value="events">Events</TabsTrigger>
        <TabsTrigger value="places">Places</TabsTrigger>
      </TabsList>

      <TabsContent value="events">{eventsContent}</TabsContent>
      <TabsContent value="places">{placesContent}</TabsContent>
    </Tabs>
  );
}
