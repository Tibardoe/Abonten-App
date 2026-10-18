"use client";

import { logEventView } from "@/actions/logEventView";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { useEffect } from "react";

// Logs one view per page load of an event's page, fire-and-forget, the same
// way PlaceViewLogger does for places: the page itself is rendered on the
// server, where a render is not a visitor. Renders nothing.
export default function EventViewLogger({ eventId }: { eventId: string }) {
  useEffect(() => {
    logEventView(eventId).catch(actionUnreachable);
  }, [eventId]);

  return null;
}
