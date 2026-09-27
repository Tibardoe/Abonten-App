"use client";

import ChangeLocationModal from "@/components/organisms/ChangeLocationModal";
import { locationLabelFromSlug } from "@/utils/locationLabel";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import NoEventsFound from "./NoEventsFound";

// Whole-tab empty state for the Explore page's Events tab -- fires when
// there are no events at all near this location (before any category/price/
// date filtering is even applied). Offers the two ways forward: look
// somewhere else, or see this area's places instead (the same shallow
// "?tab=" switch ExploreTabs itself uses).
export default function NoEventsInLocation({ location }: { location: string }) {
  const [showChangeLocationModal, setShowChangeLocationModal] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const label = locationLabelFromSlug(location);

  const showPlaces = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "places");
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  };

  return (
    <div>
      {showChangeLocationModal && (
        <ChangeLocationModal
          handleShowChangeLocationModal={setShowChangeLocationModal}
        />
      )}

      <NoEventsFound
        heading={`Nothing on in ${label} yet`}
        description={`There are no upcoming events near ${label} right now. New events are listed all the time, so check back soon or look somewhere else.`}
      />

      <div className="-mt-6 flex flex-wrap items-center justify-center gap-2 pb-8">
        <button
          type="button"
          onClick={() => setShowChangeLocationModal(true)}
          className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Change location
        </button>
        <button
          type="button"
          onClick={showPlaces}
          className="h-10 rounded-full border border-border bg-background px-5 text-sm font-semibold transition-colors hover:bg-accent"
        >
          See places instead
        </button>
      </div>
    </div>
  );
}
