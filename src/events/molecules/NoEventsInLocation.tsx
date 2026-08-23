"use client";

import ChangeLocationModal from "@/components/organisms/ChangeLocationModal";
import { useState } from "react";
import NoEventsFound from "./NoEventsFound";

// Whole-tab empty state for the Explore page's Events tab -- fires when
// there are no events at all near this location (before any category/price/
// date filtering is even applied). Mirrors NoPlacesEmptyState.tsx's
// "Change location" action/modal so both tabs offer the same recovery path
// from an empty location, layered onto the nicer icon-based treatment
// NoEventsFound provides instead of Places' plain-text style.
export default function NoEventsInLocation({ location }: { location: string }) {
  const [showChangeLocationModal, setShowChangeLocationModal] = useState(false);

  return (
    <div>
      {showChangeLocationModal && (
        <ChangeLocationModal
          handleShowChangeLocationModal={setShowChangeLocationModal}
        />
      )}

      <NoEventsFound
        heading="No events found"
        description={`We couldn't find any upcoming events in ${location} yet. Try a different location, or check back soon.`}
      />

      <div className="-mt-4 flex justify-center pb-8">
        <button
          type="button"
          onClick={() => setShowChangeLocationModal(true)}
          className="text-sm font-semibold text-primary underline underline-offset-2 hover:no-underline"
        >
          Change location
        </button>
      </div>
    </div>
  );
}
