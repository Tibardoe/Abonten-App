"use client";

import usePrefersReducedMotion from "@/hooks/usePrefersReducedMotion";
import type { WeeklyItem } from "@abonten/types/weeklyType";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaArrowLeftLong, FaArrowRightLong } from "react-icons/fa6";
import WeeklyItemFrame from "./WeeklyItemFrame";

// A horizontal row of featured listings with the same scroll mechanics and
// breakpoints as EventsSlider / PlacesSlider, but able to hold events and
// places together. The list itself scrolls with touch, trackpad and the
// keyboard (every card link is focusable); the arrow buttons are a mouse
// convenience and are hidden from assistive tech when they cannot move.
export default function WeeklyCarousel({
  items,
  label,
  eagerCount = 0,
}: {
  items: WeeklyItem[];
  label: string;
  eagerCount?: number;
}) {
  const scrollRef = useRef<HTMLUListElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const reserveHeadline = items.some((item) => !!item.headline);

  const check = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 0);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [check]);

  const scroll = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * el.clientWidth * 0.75,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };

  return (
    <div className="relative">
      {canLeft ? (
        <button
          type="button"
          onClick={() => scroll(-1)}
          className="absolute left-2 top-1/3 z-30 hidden rounded-full bg-popover/90 p-3 shadow-md backdrop-blur-sm transition-transform hover:scale-110 hover:bg-popover md:flex"
          aria-label={`Scroll ${label} left`}
        >
          <FaArrowLeftLong className="text-xl text-popover-foreground" />
        </button>
      ) : null}
      <ul
        ref={scrollRef}
        aria-label={label}
        className="scrollbar-hide grid snap-x snap-mandatory auto-cols-[85%] grid-flow-col gap-3 overflow-x-auto pb-3 sm:auto-cols-[45%] md:auto-cols-[35%] lg:auto-cols-[28%] xl:auto-cols-[25%]"
      >
        {items.map((item, index) => (
          <WeeklyItemFrame
            key={item.id}
            item={item}
            priority={index < eagerCount}
            reserveHeadline={reserveHeadline}
            className="flex min-w-0 snap-start flex-col gap-1.5"
          />
        ))}
      </ul>
      {canRight ? (
        <button
          type="button"
          onClick={() => scroll(1)}
          className="absolute right-2 top-1/3 z-30 hidden rounded-full bg-popover/90 p-3 shadow-lg backdrop-blur-sm transition-transform hover:scale-110 hover:bg-popover md:flex"
          aria-label={`Scroll ${label} right`}
        >
          <FaArrowRightLong className="text-xl text-popover-foreground" />
        </button>
      ) : null}
    </div>
  );
}
