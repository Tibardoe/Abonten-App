"use client";

import useEmblaCarousel, {
  type UseEmblaCarouselType,
} from "embla-carousel-react";
import * as React from "react";
import { FaArrowLeftLong, FaArrowRightLong } from "react-icons/fa6";
import { cn } from "../lib/utils";

export type CarouselApi = UseEmblaCarouselType[1];
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>;
type CarouselOptions = UseCarouselParameters[0];
type CarouselPlugin = UseCarouselParameters[1];

type CarouselProps = {
  opts?: CarouselOptions;
  plugins?: CarouselPlugin;
  setApi?: (api: CarouselApi) => void;
};

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: CarouselApi;
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
  selectedIndex: number;
  scrollSnaps: number[];
  scrollTo: (index: number) => void;
};

const CarouselContext = React.createContext<CarouselContextProps | null>(null);

// Thin Embla wrapper (the project has no carousel dependency yet -- see
// PROJECT context) shaped after shadcn/ui's reference carousel component, so
// it stays a familiar, Radix-adjacent API instead of a bespoke one. Only a
// single-slide-per-view horizontal layout is implemented since that's all
// Featured Events/Featured Places currently need; extend deliberately if a
// future carousel needs multi-per-view or vertical layout.
export function useCarousel() {
  const context = React.useContext(CarouselContext);
  if (!context) {
    throw new Error("Carousel components must be used within a <Carousel />");
  }
  return context;
}

export const Carousel = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & CarouselProps
>(({ opts, plugins, setApi, className, children, ...props }, ref) => {
  const [carouselRef, api] = useEmblaCarousel(opts, plugins);
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [scrollSnaps, setScrollSnaps] = React.useState<number[]>([]);

  const onSelect = React.useCallback((emblaApi: NonNullable<CarouselApi>) => {
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, []);

  const scrollPrev = React.useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = React.useCallback(() => api?.scrollNext(), [api]);
  const scrollTo = React.useCallback(
    (index: number) => api?.scrollTo(index),
    [api],
  );

  React.useEffect(() => {
    if (!api || !setApi) return;
    setApi(api);
  }, [api, setApi]);

  React.useEffect(() => {
    if (!api) return;

    setScrollSnaps(api.scrollSnapList());
    onSelect(api);
    api.on("select", onSelect);
    api.on("reInit", onSelect);

    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api, onSelect]);

  // Left/Right arrow keys move the slide when the carousel region has focus
  // -- keeps keyboard users in control without trapping Tab navigation (the
  // region itself isn't a focus stop; only its interactive children are).
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        scrollPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        scrollNext();
      }
    },
    [scrollPrev, scrollNext],
  );

  return (
    <CarouselContext.Provider
      value={{
        carouselRef,
        api,
        scrollPrev,
        scrollNext,
        canScrollPrev,
        canScrollNext,
        selectedIndex,
        scrollSnaps,
        scrollTo,
      }}
    >
      <section
        ref={ref}
        onKeyDown={handleKeyDown}
        className={cn("relative", className)}
        aria-roledescription="carousel"
        {...props}
      >
        {children}
      </section>
    </CarouselContext.Provider>
  );
});
Carousel.displayName = "Carousel";

export const CarouselContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { carouselRef } = useCarousel();

  return (
    <div ref={carouselRef} className="overflow-hidden">
      <div ref={ref} className={cn("flex", className)} {...props} />
    </div>
  );
});
CarouselContent.displayName = "CarouselContent";

export const CarouselItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="group"
    aria-roledescription="slide"
    className={cn("min-w-0 shrink-0 grow-0 basis-full", className)}
    {...props}
  />
));
CarouselItem.displayName = "CarouselItem";

export const CarouselPrevious = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => {
  const { scrollPrev, canScrollPrev } = useCarousel();

  // No loop, single slide (or fewer slides than fit one view): nothing to
  // scroll back to, so the control simply doesn't render rather than
  // showing a dead button -- see "single/zero featured item" requirements.
  if (!canScrollPrev) return null;

  return (
    <button
      ref={ref}
      type="button"
      onClick={scrollPrev}
      aria-label="Previous slide"
      className={cn(
        "hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 bg-popover/90 backdrop-blur-sm p-3 rounded-full shadow-md hover:bg-popover transition-all hover:scale-110",
        className,
      )}
      {...props}
    >
      <FaArrowLeftLong className="text-xl text-popover-foreground" />
    </button>
  );
});
CarouselPrevious.displayName = "CarouselPrevious";

export const CarouselNext = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => {
  const { scrollNext, canScrollNext } = useCarousel();

  if (!canScrollNext) return null;

  return (
    <button
      ref={ref}
      type="button"
      onClick={scrollNext}
      aria-label="Next slide"
      className={cn(
        "hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-30 bg-popover/90 backdrop-blur-sm p-3 rounded-full shadow-lg hover:bg-popover transition-all hover:scale-110",
        className,
      )}
      {...props}
    >
      <FaArrowRightLong className="text-xl text-popover-foreground" />
    </button>
  );
});
CarouselNext.displayName = "CarouselNext";

// Subtle position indicator -- only makes sense once there's more than one
// slide to be "at slide N of M" (see "single featured item" requirement:
// never render dots/controls for a single-slide carousel).
export const CarouselDots = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { scrollSnaps, selectedIndex, scrollTo } = useCarousel();

  if (scrollSnaps.length <= 1) return null;

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label="Slides"
      className={cn("flex items-center justify-center gap-1.5", className)}
      {...props}
    >
      {scrollSnaps.map((_, index) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: scrollSnaps is a stable-length position list, not reorderable data
          key={index}
          type="button"
          role="tab"
          aria-selected={index === selectedIndex}
          aria-label={`Go to slide ${index + 1} of ${scrollSnaps.length}`}
          onClick={() => scrollTo(index)}
          className={cn(
            "h-1.5 rounded-full transition-all",
            index === selectedIndex
              ? "w-4 bg-primary"
              : "w-1.5 bg-primary/30 hover:bg-primary/50",
          )}
        />
      ))}
    </div>
  );
});
CarouselDots.displayName = "CarouselDots";
