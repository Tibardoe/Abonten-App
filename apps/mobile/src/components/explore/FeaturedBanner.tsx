import { WeeklyBanner } from "@/components/weekly/WeeklyBanner";
import {
  WeeklyChip,
  weeklyListingPath,
} from "@/components/weekly/weeklyBannerParts";
import { logPlacePromotionImpression } from "@/features/places/placeEngagement";
import { hapticLight } from "@/lib/haptics";
import { getFormattedEventDate } from "@abonten/core/dateFormatter";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import type { WeeklyBannerSlide } from "@abonten/types/weeklyType";
import { AppText } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { View, useWindowDimensions } from "react-native";

// Featured (paid) events or places at the top of Explore, presented exactly
// the way the Abonten Weekly banner presents an edition: the listings fill
// the banner and take turns behind the text with a cross-fade and a slow
// drift, story-style segments show progress, a caption card names the
// listing on show, swipe left/right to move, and it pauses while touched,
// off-screen or backgrounded. Tapping anywhere opens the listing on show.
//
// It is a paid placement, so every slide is disclosed: the eyebrow chip says
// "Featured" (events) or "Sponsored" (places) — the web banners' words — and
// each caption repeats it.

function eventSlide(e: UserPostType): WeeklyBannerSlide {
  const when = getFormattedEventDate(
    e.starts_at,
    e.ends_at,
    e.occurrences,
    e.timezone,
  );
  const meta = [when?.date, e.address?.full_address]
    .filter(Boolean)
    .join(" · ");
  return {
    key: `event:${e.id}`,
    subjectType: "event",
    subjectId: e.id,
    title: e.title,
    headline: "Featured event",
    meta: meta || null,
    publicId: e.flyer_public_id ?? "",
    version: e.flyer_version ?? null,
    webPath: `/events/${e.event_code}`,
  };
}

function placeSlide(p: PlaceType): WeeklyBannerSlide {
  const rating =
    (p.review_count ?? 0) > 0 ? `${(p.avg_rating ?? 0).toFixed(1)} ★` : null;
  const meta = [p.category_name, rating].filter(Boolean).join(" · ");
  return {
    key: `place:${p.id}`,
    subjectType: "place",
    subjectId: p.id,
    title: p.name,
    headline: "Sponsored place",
    meta: meta || null,
    publicId: p.cover_public_id ?? "",
    version: p.cover_version ?? null,
    webPath: `/places/${p.slug ?? p.id}`,
  };
}

export function FeaturedBanner({
  kind,
  events,
  places,
}: {
  kind: "events" | "places";
  events: UserPostType[];
  places: PlaceType[];
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const slides = useMemo(
    () => (kind === "events" ? events.map(eventSlide) : places.map(placeSlide)),
    [kind, events, places],
  );

  // A sponsored place counts one impression when its slide is actually on
  // show, once per mount — the web FeaturedPlacesSlider's rule.
  const counted = useRef(new Set<string>());
  const onSlideShown = useCallback((slide: WeeklyBannerSlide) => {
    if (slide.subjectType !== "place") return;
    if (counted.current.has(slide.subjectId)) return;
    counted.current.add(slide.subjectId);
    logPlacePromotionImpression(slide.subjectId);
  }, []);

  if (slides.length === 0) return null;

  // Slightly shorter than the Weekly banner (380–480) so the two heroes
  // stacked still leave the feed within reach; same responsive rule.
  const height = Math.round(Math.min(Math.max(width * 0.92, 340), 420));
  const count = slides.length;
  const label = kind === "events" ? "Featured events" : "Sponsored places";

  const open = (slide: WeeklyBannerSlide | null) => {
    if (!slide) return;
    hapticLight();
    router.push(weeklyListingPath(slide));
  };

  return (
    <View className="mb-2 mt-3">
      <WeeklyBanner
        slides={slides}
        height={height}
        onPress={open}
        onSlidePress={open}
        onSlideShown={onSlideShown}
        accessibilityLabel={`${label}, ${count} ${count === 1 ? "listing" : "listings"}. Opens the one on show.`}
        eyebrow={
          <WeeklyChip strong>
            {kind === "events" ? "📣 Featured" : "📣 Sponsored"}
          </WeeklyChip>
        }
      >
        <AppText
          className="text-[12px] font-medium"
          style={{ color: "rgba(255,255,255,0.82)" }}
        >
          {count} {count === 1 ? "pick" : "picks"} · Paid placement
        </AppText>
        <AppText
          className="mt-1.5 text-[30px] font-extrabold leading-[33px] text-white"
          numberOfLines={2}
        >
          {kind === "events" ? "Featured events" : "Featured places"}
        </AppText>
        <AppText
          className="mt-2 text-[14px] leading-[20px]"
          style={{ color: "rgba(255,255,255,0.85)" }}
          numberOfLines={2}
        >
          {kind === "events"
            ? "Promoted by organizers near you."
            : "Promoted by places near you."}
        </AppText>
      </WeeklyBanner>
    </View>
  );
}
