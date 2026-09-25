import type {
  WeeklyBannerSlide,
  WeeklySection,
} from "@abonten/types/weeklyType";
import { getEventCardDateTime } from "../dateFormatter";

export const WEEKLY_BANNER_MAX_SLIDES = 6;

// The rotating backgrounds of an Abonten Weekly banner (the Explore teaser and
// the edition masthead, on web and in the app). Listings are taken in the
// editor's order, hero sections first because the editor gave them the most
// room; a listing that appears in several sections is used once, and listings
// without an image are skipped. The result is plain data so the service, the
// web page and the app build identical slides.
export function weeklyBannerSlides(
  sections: WeeklySection[],
  max: number = WEEKLY_BANNER_MAX_SLIDES,
): WeeklyBannerSlide[] {
  const ordered = [
    ...sections.filter((s) => s.layout === "hero"),
    ...sections.filter((s) => s.layout !== "hero"),
  ];
  const seen = new Set<string>();
  const slides: WeeklyBannerSlide[] = [];

  for (const section of ordered) {
    for (const item of section.items) {
      if (slides.length >= max) return slides;
      const subjectKey = `${item.subjectType}:${item.subjectId}`;
      if (seen.has(subjectKey)) continue;

      const event = item.event;
      const place = item.place;
      if (event?.flyer_public_id) {
        const when = getEventCardDateTime(
          event.starts_at,
          event.ends_at,
          event.occurrences,
          event.timezone,
        );
        seen.add(subjectKey);
        slides.push({
          key: item.id,
          subjectType: "event",
          subjectId: event.id,
          title: event.title,
          headline: item.headline,
          meta: [when.date, when.time].filter(Boolean).join(" · ") || null,
          publicId: event.flyer_public_id,
          version: event.flyer_version ?? null,
          webPath: `/events/${event.event_code.toLowerCase()}`,
        });
      } else if (place?.cover_public_id) {
        const rating =
          place.avg_rating != null && Number(place.avg_rating) > 0
            ? `${Number(place.avg_rating).toFixed(1)} ★`
            : null;
        seen.add(subjectKey);
        slides.push({
          key: item.id,
          subjectType: "place",
          subjectId: place.id,
          title: place.name,
          headline: item.headline,
          meta:
            [place.category_name, rating].filter(Boolean).join(" · ") || null,
          publicId: place.cover_public_id,
          version: place.cover_version ?? null,
          webPath: `/places/${place.slug}`,
        });
      }
    }
  }
  return slides;
}
