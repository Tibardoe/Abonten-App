import { supabase } from "@/lib/supabase";
import { normalizeLinkSource } from "@abonten/core/social/linkSources";
import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * One view per opening of an event's screen, once its details have loaded —
 * the app's twin of the web EventViewLogger, so the organizer's "Page views"
 * count both. `event_analytics_event` takes public inserts, so this is a
 * direct, fire-and-forget write: it never blocks rendering and a failure
 * (offline) is ignored. The signed-in session goes with it, so the database
 * leaves out the organizer's own views; the row keeps no account id.
 */
export function useLogEventView(
  eventId: string | undefined,
  /** The `src` of the Abonten link that opened the screen, if any. */
  source?: string | null,
): void {
  const tag = normalizeLinkSource(source);
  useEffect(() => {
    if (!eventId) return;
    void supabase
      .from("event_analytics_event")
      .insert({
        event_id: eventId,
        event_type: "view",
        platform: Platform.OS === "ios" ? "ios" : "android",
        source: tag,
      })
      .then(() => {});
  }, [eventId, tag]);
}
