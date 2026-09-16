"use client";

import { cn } from "@/components/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  FEED_SURFACES,
  FEED_SURFACE_LABEL,
  SPOTLIGHT_TAGLINE,
} from "@abonten/core/content/copy";
import { getSignInUrl } from "@abonten/core/getSignInUrl";
import type {
  ContentFeedSurface,
  ContentProgram,
} from "@abonten/types/contentType";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IoAddCircleOutline } from "react-icons/io5";
import {
  type FeedCoords,
  flattenFeed,
  useContentFeed,
} from "../hooks/useContentFeed";
import { useContentProgram } from "../hooks/useContentProgram";
import SpotlightCard from "./SpotlightCard";

function surfaceAvailable(
  surface: ContentFeedSurface,
  program: ContentProgram,
): boolean {
  if (surface === "nearby") return program.nearby;
  if (surface === "trending") return program.trending;
  if (surface === "happening_soon") return program.happeningSoon;
  return true;
}

function isSurface(value: string | null): value is ContentFeedSurface {
  return !!value && (FEED_SURFACES as readonly string[]).includes(value);
}

/** Asks the browser for a rough position once, only for the Nearby tab. */
function useBrowserCoords(wanted: boolean) {
  const [coords, setCoords] = useState<FeedCoords>(null);
  const [state, setState] = useState<"idle" | "asking" | "denied" | "ok">(
    "idle",
  );
  useEffect(() => {
    if (!wanted || state !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("denied");
      return;
    }
    setState("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setState("ok");
      },
      () => setState("denied"),
      { maximumAge: 10 * 60 * 1000, timeout: 10_000 },
    );
  }, [wanted, state]);
  return { coords, state };
}

export default function SpotlightFeed() {
  const { program, ready } = useContentProgram();
  const { data: user } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const surface: ContentFeedSurface = isSurface(tabParam)
    ? tabParam
    : "for_you";

  const surfaces = useMemo(
    () => FEED_SURFACES.filter((s) => surfaceAvailable(s, program)),
    [program],
  );

  const needsSignIn = surface === "following" && !user;
  const { coords, state: geoState } = useBrowserCoords(surface === "nearby");
  const waitingForCoords = surface === "nearby" && geoState !== "ok";

  const feed = useContentFeed(
    surface,
    coords,
    ready &&
      program.spotlight &&
      surfaceAvailable(surface, program) &&
      !needsSignIn &&
      !waitingForCoords,
  );
  const allItems = flattenFeed(feed.data?.pages);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const items = allItems.filter((i) => !hidden.has(i.post.id));

  const scroller = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // The card most in view is the active one (the only one that plays).
  // Re-observes whenever the number of cards changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the card count on purpose
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const index = Number(
              (entry.target as HTMLElement).dataset.index ?? 0,
            );
            setActiveIndex(index);
          }
        }
      },
      { root, threshold: [0.6] },
    );
    for (const child of Array.from(root.children)) {
      if ((child as HTMLElement).dataset.index !== undefined) {
        observer.observe(child);
      }
    }
    return () => observer.disconnect();
  }, [items.length]);

  // Load the next page two cards before the end.
  useEffect(() => {
    if (
      items.length > 0 &&
      activeIndex >= items.length - 3 &&
      feed.hasNextPage &&
      !feed.isFetchingNextPage
    ) {
      feed.fetchNextPage();
    }
  }, [activeIndex, items.length, feed]);

  const scrollToIndex = useCallback((index: number) => {
    const root = scroller.current;
    const target = root?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector("[role='dialog']")) return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        scrollToIndex(Math.min(items.length - 1, activeIndex + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollToIndex(Math.max(0, activeIndex - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, items.length, scrollToIndex]);

  const selectSurface = (next: ContentFeedSurface) => {
    setActiveIndex(0);
    scroller.current?.scrollTo({ top: 0 });
    const params = new URLSearchParams(searchParams.toString());
    if (next === "for_you") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  if (!ready) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!program.spotlight) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-bold">Spotlight isn't available yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We're rolling it out gradually. Check back soon.
        </p>
      </div>
    );
  }

  let emptyState: React.ReactNode = null;
  if (needsSignIn) {
    emptyState = (
      <EmptyPanel
        title="Follow organizers and places"
        body="Sign in to see Spotlights from the people you follow."
        action={{
          href: getSignInUrl("/spotlight?tab=following"),
          label: "Sign in",
        }}
      />
    );
  } else if (surface === "nearby" && geoState === "denied") {
    emptyState = (
      <EmptyPanel
        title="Location is off"
        body="Allow location in your browser to see Spotlights near you."
      />
    );
  } else if (feed.isError) {
    emptyState = (
      <EmptyPanel
        title="Couldn't load Spotlight"
        body="Check your connection and try again."
        onRetry={() => feed.refetch()}
      />
    );
  } else if (!feed.isLoading && !waitingForCoords && items.length === 0) {
    emptyState = (
      <EmptyPanel
        title="Nothing here yet"
        body={
          surface === "following"
            ? "Follow organizers and places to fill this tab."
            : "New Spotlights will show up here."
        }
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Spotlight</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {SPOTLIGHT_TAGLINE}
          </p>
        </div>
        {program.canPublish && program.spotlightPosting ? (
          <Link
            href="/manage/spotlight?new=spotlight"
            className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <IoAddCircleOutline aria-hidden className="text-lg" />
            Create
          </Link>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="Spotlight feeds"
        className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {surfaces.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={surface === s}
            onClick={() => selectSurface(s)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-sm font-medium transition",
              surface === s
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted text-muted-foreground hover:bg-accent",
            )}
          >
            {FEED_SURFACE_LABEL[s]}
          </button>
        ))}
      </div>

      <div
        ref={scroller}
        className="relative h-[calc(100dvh-17rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-2xl bg-black [scrollbar-width:none] md:h-[calc(100dvh-15rem)] [&::-webkit-scrollbar]:hidden"
      >
        {emptyState ??
          (feed.isLoading || waitingForCoords ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            </div>
          ) : (
            <>
              {items.map((item, index) => (
                <div
                  key={item.post.id}
                  data-index={index}
                  className="h-full w-full snap-start snap-always"
                >
                  {Math.abs(index - activeIndex) <= 2 ? (
                    <SpotlightCard
                      item={item}
                      active={index === activeIndex}
                      surface={surface}
                      onHide={() =>
                        setHidden((prev) => new Set(prev).add(item.post.id))
                      }
                    />
                  ) : null}
                </div>
              ))}
              {feed.isFetchingNextPage ? (
                <div className="flex h-16 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-white/70" />
                </div>
              ) : null}
            </>
          ))}
      </div>

      <p className="hidden text-center text-xs text-muted-foreground md:block">
        Use ↑ ↓ to move, Space to pause, M for sound, L to like.
      </p>
    </div>
  );
}

function EmptyPanel({
  title,
  body,
  action,
  onRetry,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center text-white">
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-sm text-white/70">{body}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-2 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black"
        >
          {action.label}
        </Link>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
