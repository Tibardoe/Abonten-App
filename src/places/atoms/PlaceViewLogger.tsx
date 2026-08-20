"use client";

import { logPlaceEngagement } from "@/actions/logPlaceEngagement";
import { useEffect } from "react";

type PlaceViewLoggerProps = {
  placeId: string;
};

// The place details page (page.tsx) is a Server Component rendered with
// ISR (revalidate = 60) -- logging a view directly in its render body would
// fire on every cache refresh, not once per real visitor. This tiny client
// component mounts once per page load and logs fire-and-forget, same
// not-awaited pattern PlaceActionButtons.tsx uses for its click events.
// Renders nothing.
export default function PlaceViewLogger({ placeId }: PlaceViewLoggerProps) {
  useEffect(() => {
    logPlaceEngagement(placeId, "view");
  }, [placeId]);

  return null;
}
