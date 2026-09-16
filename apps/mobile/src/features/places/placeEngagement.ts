import { supabase } from "@/lib/supabase";

// Place analytics from the app — the native twin of the web
// `logPlaceEngagement` action. `place_analytics_event` takes public inserts
// (RLS policy place_analytics_event_public_insert), so this is a direct,
// fire-and-forget write: it never blocks rendering and a failure is ignored.
//
// Only `promotion_impression` is sent from the app so far: a Featured
// (sponsored) place shown in the Explore Featured banner, counted once per place
// per time the banner is mounted — the same rule as the web
// FeaturedPlacesSlider, so owners see comparable numbers from both.
export function logPlacePromotionImpression(placeId: string): void {
  void supabase
    .from("place_analytics_event")
    .insert({ place_id: placeId, event_type: "promotion_impression" })
    .then(() => {});
}
