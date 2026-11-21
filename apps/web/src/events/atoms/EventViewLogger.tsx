"use client";

import { logEventView } from "@/actions/logEventView";
import { actionUnreachable } from "@/utils/actionUnreachable";
import {
  LINK_SOURCE_PARAM,
  normalizeLinkSource,
} from "@abonten/core/social/linkSources";
import { useEffect } from "react";

// Logs one view per page load of an event's page, fire-and-forget, the same
// way PlaceViewLogger does for places: the page itself is rendered on the
// server, where a render is not a visitor. The address's ?src= (a link
// Abonten posted on its own socials) goes with the view, read from the
// address bar once the page is in the browser. Renders nothing.
export default function EventViewLogger({ eventId }: { eventId: string }) {
  useEffect(() => {
    const source = normalizeLinkSource(
      new URLSearchParams(window.location.search).get(LINK_SOURCE_PARAM),
    );
    logEventView(eventId, source).catch(actionUnreachable);
  }, [eventId]);

  return null;
}
