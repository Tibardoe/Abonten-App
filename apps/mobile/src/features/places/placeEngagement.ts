import { supabase } from "@/lib/supabase";
import { useEffect } from "react";
import { Platform } from "react-native";

// Place analytics from the app — the native twin of the web
// `logPlaceEngagement` action. `place_analytics_event` takes public inserts
// (RLS policy place_analytics_event_public_insert), so these are direct,
// fire-and-forget writes: they never block rendering and a failure is
// ignored. The signed-in session goes with them, so the database leaves out
// an owner's views of their own place; the row keeps no account id.
const platform = Platform.OS === "ios" ? "ios" : "android";

// A Featured (sponsored) place shown in the Explore Featured banner, counted
// once per place per time the banner is mounted — the same rule as the web
// FeaturedPlacesSlider, so owners see comparable numbers from both.
export function logPlacePromotionImpression(placeId: string): void {
  void supabase
    .from("place_analytics_event")
    .insert({ place_id: placeId, event_type: "promotion_impression", platform })
    .then(() => {});
}

/**
 * One view per opening of a place's screen, once its details have loaded —
 * the app's twin of the web PlaceViewLogger, so owners' "Place views" count
 * both.
 */
export function useLogPlaceView(placeId: string | undefined): void {
  useEffect(() => {
    if (!placeId) return;
    void supabase
      .from("place_analytics_event")
      .insert({ place_id: placeId, event_type: "view", platform })
      .then(() => {});
  }, [placeId]);
}
