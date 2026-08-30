"use client";

import type { CarouselApi } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { useEffect, useRef, useState } from "react";
import usePrefersReducedMotion from "./usePrefersReducedMotion";

// Shared autoplay wiring for the Featured Events/Featured Places carousels:
// one Autoplay plugin instance per carousel (created once via useRef, same
// pattern embla-carousel-autoplay's own docs use), paused for as long as the
// viewer prefers reduced motion, and left otherwise alone -- Embla's own
// `stopOnMouseEnter`/`stopOnInteraction: false` already handle "don't fight
// the user's swipe, resume after" without any extra code here.
export function useCarouselAutoplay(delayMs: number) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const autoplay = useRef(
    Autoplay({
      delay: delayMs,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
    }),
  );
  const [api, setApi] = useState<CarouselApi>();

  useEffect(() => {
    const autoplayPlugin = api?.plugins().autoplay;
    if (!autoplayPlugin) return;

    if (prefersReducedMotion) {
      autoplayPlugin.stop();
    } else {
      autoplayPlugin.play();
    }
  }, [api, prefersReducedMotion]);

  return { plugin: autoplay.current, setApi };
}
