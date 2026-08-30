"use client";

import Banner from "@/components/molecules/Banner";
import {
  Carousel,
  CarouselContent,
  CarouselDots,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useCarouselAutoplay } from "@/hooks/useCarouselAutoplay";
import type { UserPostType } from "@/types/postsType";

const AUTOPLAY_DELAY_MS = 4000;

type FeaturedEventsCarouselProps = {
  events: UserPostType[];
};

// Featured Events banner. `events` is already eligibility-filtered and
// ordered by getFeaturedEvents() (past/ended/cancelled/sold-out events are
// never in this list) -- this component only decides how to *display* that
// list: nothing for zero events, a plain static Banner for exactly one (no
// slide animation, no dots, no duplicated item), and a looping autoplaying
// carousel only once there's genuinely more than one to rotate through.
export default function FeaturedEventsCarousel({
  events,
}: FeaturedEventsCarouselProps) {
  const { plugin, setApi } = useCarouselAutoplay(AUTOPLAY_DELAY_MS);

  if (events.length === 0) return null;
  if (events.length === 1) return <Banner event={events[0]} />;

  return (
    <Carousel
      opts={{ loop: true, align: "start" }}
      plugins={[plugin]}
      setApi={setApi}
      className="w-full"
    >
      <CarouselContent>
        {events.map((event) => (
          <CarouselItem key={event.id}>
            <Banner event={event} />
          </CarouselItem>
        ))}
      </CarouselContent>

      <CarouselPrevious />
      <CarouselNext />
      <CarouselDots className="mt-3" />
    </Carousel>
  );
}
