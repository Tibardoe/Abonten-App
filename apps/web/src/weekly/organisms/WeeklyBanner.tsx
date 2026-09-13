"use client";

import { cn } from "@/components/lib/utils";
import usePrefersReducedMotion from "@/hooks/usePrefersReducedMotion";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import type { WeeklyBannerSlide } from "@abonten/types/weeklyType";
import Image from "next/image";
import Link from "next/link";
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  FiArrowUpRight,
  FiChevronLeft,
  FiChevronRight,
  FiPause,
  FiPlay,
} from "react-icons/fi";

// The Abonten Weekly banner, used for the Explore teaser and the edition
// masthead. The edition's own listings fill the whole banner and take turns
// behind the text: a slow cross-fade with a gentle drift, a caption that links
// to the listing on show, story-style progress segments, arrows, swipe, and a
// pause button. Rotation stops while the pointer or keyboard focus is inside,
// while the banner is off screen or the tab is hidden, and never starts for
// people who prefer reduced motion (WCAG 2.2.2).

const SLIDE_MS = 6500;
const SWIPE_PX = 40;

type Variant = "teaser" | "masthead";

const HEIGHTS: Record<Variant, string> = {
  teaser: "min-h-[460px] sm:min-h-[400px] md:min-h-[400px] lg:min-h-[440px]",
  masthead: "min-h-[540px] sm:min-h-[460px] md:min-h-[480px] lg:min-h-[540px]",
};

export default function WeeklyBanner({
  slides,
  label,
  variant,
  href,
  linkLabel,
  eyebrow,
  children,
  priority = false,
}: {
  slides: WeeklyBannerSlide[];
  /** Accessible name of the banner region. */
  label: string;
  variant: Variant;
  /** When set, the whole banner opens this page (the teaser). */
  href?: string;
  linkLabel?: string;
  /** Top-left chip row. */
  eyebrow: ReactNode;
  /** The main text block, bottom-left. */
  children: ReactNode;
  priority?: boolean;
}) {
  const count = slides.length;
  const rotating = count > 1;
  const reducedMotion = usePrefersReducedMotion();

  const [index, setIndex] = useState(0);
  // Bumped on every change so the progress bar and the drift restart.
  const [cycle, setCycle] = useState(0);
  // The cycle in which each slide was last shown (its image remounts then).
  const [shownAt, setShownAt] = useState<number[]>(() => slides.map(() => 0));
  // Only the slide on show and the next one are in the DOM, so a six-slide
  // banner does not download six large images up front.
  const [mounted, setMounted] = useState<Set<number>>(
    () => new Set(count > 1 ? [0, 1] : [0]),
  );
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);

  const cycleRef = useRef(0);
  const rootRef = useRef<HTMLElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const running =
    rotating &&
    !reducedMotion &&
    !userPaused &&
    !hovered &&
    !focused &&
    onScreen &&
    pageVisible;

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      const target = ((next % count) + count) % count;
      cycleRef.current += 1;
      const nextCycle = cycleRef.current;
      setCycle(nextCycle);
      setShownAt((prev) => {
        const copy = [...prev];
        copy[target] = nextCycle;
        return copy;
      });
      setIndex(target);
      setMounted((prev) => {
        if (prev.has(target) && prev.has((target + 1) % count)) return prev;
        const copy = new Set(prev);
        copy.add(target);
        copy.add((target + 1) % count);
        return copy;
      });
    },
    [count],
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" || !rotating) return;
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
      swiped.current = true;
      go(dx < 0 ? index + 1 : index - 1);
      window.setTimeout(() => {
        swiped.current = false;
      }, 400);
    }
  };
  // A swipe ends with a click on whatever is under the finger; don't follow it.
  const swallowSwipeClick = (e: MouseEvent) => {
    if (swiped.current) e.preventDefault();
  };

  const onControlsKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index - 1);
    }
  };

  const slide = count > 0 ? slides[index] : null;

  return (
    <section
      ref={rootRef}
      aria-roledescription={rotating ? "carousel" : undefined}
      aria-label={label}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        pointerStart.current = null;
      }}
      onFocus={(e) => {
        // Keyboard focus pauses; a mouse click on a control does not.
        if ((e.target as HTMLElement).matches?.(":focus-visible")) {
          setFocused(true);
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
      className={cn(
        "group/banner relative isolate flex touch-pan-y overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl shadow-black/10 ring-1 ring-black/5 dark:ring-white/10",
        HEIGHTS[variant],
      )}
    >
      {/* Backgrounds */}
      <div aria-hidden className="absolute inset-0 -z-10">
        {count === 0 ? (
          <BrandBackdrop />
        ) : (
          slides.map((s, i) =>
            mounted.has(i) ? (
              <div
                key={s.key}
                className={cn(
                  "absolute inset-0 transition-opacity ease-out",
                  reducedMotion ? "duration-300" : "duration-1000",
                  i === index ? "opacity-100" : "opacity-0",
                )}
              >
                <div
                  key={`${s.key}-${shownAt[i] ?? 0}`}
                  className={cn(
                    "absolute inset-0",
                    rotating && "animate-weekly-kenburns",
                  )}
                  style={{
                    animationPlayState:
                      running || i !== index ? "running" : "paused",
                  }}
                >
                  <Image
                    src={buildCloudinaryUrl(s.publicId, s.version, {
                      width: 1100,
                    })}
                    alt=""
                    fill
                    priority={priority && i === 0}
                    quality={90}
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1200px"
                    className="object-cover"
                  />
                </div>
              </div>
            ) : null,
          )
        )}
        {/* Legibility: dark from the text side, a floor for the controls,
            and a faint brand glow so every edition feels like one family. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/20 md:bg-gradient-to-r md:from-black/85 md:via-black/50 md:to-black/5" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(110%_70%_at_0%_0%,hsl(var(--primary)/0.38),transparent_60%)]" />
      </div>

      {href ? (
        <Link
          href={href}
          aria-label={linkLabel}
          onClick={swallowSwipeClick}
          draggable={false}
          className="absolute inset-0 z-10 rounded-3xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary"
        />
      ) : null}

      <div
        className={cn(
          "relative z-20 flex w-full flex-col justify-between gap-6 p-5 sm:p-7 md:p-9 lg:p-11",
          href && "pointer-events-none",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {eyebrow}
          </div>
          {rotating && !reducedMotion ? (
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-label={
                userPaused ? "Resume the slideshow" : "Pause the slideshow"
              }
              className="pointer-events-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/30 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {userPaused ? (
                <FiPlay aria-hidden className="ml-0.5 h-4 w-4" />
              ) : (
                <FiPause aria-hidden className="h-4 w-4" />
              )}
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-8">
          <div className="min-w-0 max-w-2xl">{children}</div>

          {slide ? (
            <div
              className="pointer-events-auto flex w-full shrink-0 flex-col gap-3 md:w-80"
              onClickCapture={swallowSwipeClick}
            >
              <div aria-live={running ? "off" : "polite"} aria-atomic>
                <Link
                  href={slide.webPath}
                  draggable={false}
                  className="group/caption flex items-center gap-3 rounded-2xl bg-white/10 p-2 pr-3 ring-1 ring-white/15 backdrop-blur-md transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <span className="relative hidden h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/10 sm:block">
                    <Image
                      key={slide.key}
                      src={buildCloudinaryUrl(slide.publicId, slide.version, {
                        width: 48,
                        height: 48,
                      })}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover animate-in fade-in duration-500"
                    />
                  </span>
                  <span
                    key={slide.key}
                    className="min-w-0 flex-1 animate-in fade-in slide-in-from-bottom-1 duration-500 motion-reduce:animate-none"
                  >
                    <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
                      {slide.headline ??
                        (slide.subjectType === "event"
                          ? "Featured event"
                          : "Featured place")}
                    </span>
                    <span className="block truncate text-sm font-semibold">
                      {slide.title}
                    </span>
                    {slide.meta ? (
                      <span className="block truncate text-xs text-white/75">
                        {slide.meta}
                      </span>
                    ) : null}
                  </span>
                  <FiArrowUpRight
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-white/80 transition group-hover/caption:-translate-y-0.5 group-hover/caption:translate-x-0.5"
                  />
                </Link>
              </div>

              {rotating ? (
                // Arrow keys move between picks while focus is on a control.
                <fieldset
                  className="m-0 flex min-w-0 items-center gap-2 border-0 p-0"
                  onKeyDown={onControlsKeyDown}
                >
                  <legend className="sr-only">Slideshow controls</legend>
                  <ArrowButton
                    label="Previous pick"
                    onClick={() => go(index - 1)}
                  >
                    <FiChevronLeft aria-hidden className="h-5 w-5" />
                  </ArrowButton>
                  <div className="flex flex-1 items-center gap-1.5">
                    {slides.map((s, i) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => go(i)}
                        aria-label={`Show pick ${i + 1} of ${count}: ${s.title}`}
                        aria-current={i === index ? "true" : undefined}
                        className="group/seg flex h-6 flex-1 items-center focus-visible:outline-none"
                      >
                        <span className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/seg:h-1.5 group-focus-visible/seg:h-1.5 group-focus-visible/seg:ring-2 group-focus-visible/seg:ring-white">
                          {i < index ||
                          (i === index && (reducedMotion || !rotating)) ? (
                            <span className="absolute inset-0 rounded-full bg-white" />
                          ) : i === index ? (
                            <span
                              key={`${index}-${cycle}`}
                              className="absolute inset-y-0 left-0 rounded-full bg-white animate-story"
                              style={
                                {
                                  "--animation-duration": `${SLIDE_MS}ms`,
                                  animationPlayState: running
                                    ? "running"
                                    : "paused",
                                } as CSSProperties
                              }
                              onAnimationEnd={() => go(index + 1)}
                            />
                          ) : null}
                        </span>
                      </button>
                    ))}
                  </div>
                  <ArrowButton label="Next pick" onClick={() => go(index + 1)}>
                    <FiChevronRight aria-hidden className="h-5 w-5" />
                  </ArrowButton>
                </fieldset>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ArrowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="hidden h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 sm:grid text-white ring-1 ring-white/20 backdrop-blur-md transition hover:scale-105 hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-95 motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}

// Shown when no listing in the edition has an image yet.
function BrandBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-primary via-teal-800 to-slate-950">
      <div className="absolute -left-16 -top-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
      <div className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl" />
      <div className="absolute right-1/3 top-1/4 h-40 w-40 rounded-full bg-emerald-300/20 blur-2xl" />
    </div>
  );
}
