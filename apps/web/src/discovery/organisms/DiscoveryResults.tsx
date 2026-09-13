"use client";

import { logSearchClick } from "@/actions/discovery/logSearchClick";
import { searchDiscovery } from "@/actions/discovery/searchDiscovery";
import { cn } from "@/components/lib/utils";
import EventCard from "@/components/molecules/EventCard";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import OrganizerCard from "@/discovery/molecules/OrganizerCard";
import NoEventsFound from "@/events/molecules/NoEventsFound";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import PlaceCard from "@/places/molecules/PlaceCard";
import { eventCategoriesAndTypes } from "@abonten/core/eventCategoriesAndTypes";
import type {
  SearchEntityType,
  SearchEventHit,
  SearchGroup,
  SearchMode,
  SearchOrganizerHit,
  SearchPlaceHit,
  SearchRequest,
  SearchResults,
} from "@abonten/types/searchType";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useMemo, useRef } from "react";
import { IoClose } from "react-icons/io5";

// The unified results view for /search: grouped Events / Places / Organizers
// on the "All" tab (each with "See all"), a single infinitely scrolling list
// on the other tabs. The first page is rendered on the server; later pages
// come from the searchDiscovery Server Action. The first result opened is
// reported once per search (no identity), which is what the zero-result and
// click-through panels in Admin › Discovery are built on.

const TABS: { mode: SearchMode; label: string }[] = [
  { mode: "all", label: "All" },
  { mode: "events", label: "Events" },
  { mode: "places", label: "Places" },
  { mode: "organizers", label: "Organizers" },
];

const GRID = "grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-5";

function hrefFor(
  request: SearchRequest,
  patch: Partial<SearchRequest> & { by?: string | null },
) {
  const next = { ...request, ...patch };
  const qs = new URLSearchParams();
  if (next.q) qs.set("q", next.q);
  if (next.mode && next.mode !== "all") qs.set("type", next.mode);
  if (next.organizerId) qs.set("organizer", next.organizerId);
  if (patch.by) qs.set("by", patch.by);
  return `/search${qs.toString() ? `?${qs.toString()}` : ""}`;
}

function renderEvent(event: SearchEventHit, index: number) {
  return <EventCard key={event.id} priority={index < 4} {...event} />;
}
function renderPlace(place: SearchPlaceHit, index: number) {
  return <PlaceCard key={place.id} priority={index < 4} {...place} />;
}
function renderOrganizer(organizer: SearchOrganizerHit) {
  return <OrganizerCard key={organizer.id} organizer={organizer} />;
}

function useClickLogger(searchId: number | null) {
  const logged = useRef(false);
  return useCallback(
    (entityType: SearchEntityType, entityId: string, rank: number) => {
      if (!searchId || logged.current) return;
      logged.current = true;
      void logSearchClick({ searchId, entityType, entityId, rank });
    },
    [searchId],
  );
}

/** Reports which card in a list was opened, by its position among the <li>s. */
function ClickableList<T extends { id: string }>({
  items,
  entityType,
  onOpen,
  render,
  className,
}: {
  items: T[];
  entityType: SearchEntityType;
  onOpen: (type: SearchEntityType, id: string, rank: number) => void;
  render: (item: T, index: number) => React.ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={className}
      onClickCapture={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest("a")) return;
        const li = target.closest("li");
        if (!li?.parentElement) return;
        const rank = Array.prototype.indexOf.call(
          li.parentElement.children,
          li,
        );
        const item = items[rank];
        if (item) onOpen(entityType, item.id, rank);
      }}
    >
      {items.map(render)}
    </ul>
  );
}

function SingleGroup<T extends { id: string }>({
  request,
  initial,
  pick,
  entityType,
  render,
  className,
  onOpen,
}: {
  request: SearchRequest;
  initial: SearchGroup<T>;
  pick: (r: SearchResults) => SearchGroup<T>;
  entityType: SearchEntityType;
  render: (item: T, index: number) => React.ReactNode;
  className: string;
  onOpen: (type: SearchEntityType, id: string, rank: number) => void;
}) {
  const query = useInfiniteQuery({
    queryKey: ["discovery-search", request],
    initialPageParam: null as string | null,
    initialData: { pages: [initial], pageParams: [null] },
    queryFn: async ({ pageParam }) => {
      const res = await searchDiscovery({ ...request, cursor: pageParam });
      if (res.status !== 200) throw new Error(res.message ?? "Search failed");
      return pick(res);
    },
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
    staleTime: 60_000,
  });
  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const sentinel = useInfiniteScrollSentinel({
    onIntersect: loadMore,
    enabled: !!hasNextPage && !isFetchingNextPage,
  });

  return (
    <>
      <ClickableList
        items={items}
        entityType={entityType}
        onOpen={onOpen}
        render={render}
        className={className}
      />
      {query.isFetchingNextPage ? (
        <p
          className="py-4 text-center text-sm text-muted-foreground"
          aria-live="polite"
        >
          Loading more…
        </p>
      ) : null}
      {query.isFetchNextPageError ? (
        <InlineErrorRetry
          message="Couldn't load more results."
          onRetry={() => query.fetchNextPage()}
        />
      ) : null}
      <div ref={sentinel} aria-hidden className="h-1" />
    </>
  );
}

function NoResults({ request }: { request: SearchRequest }) {
  const organizerMode = request.q.trim().startsWith("@");
  const categories = eventCategoriesAndTypes.slice(0, 6).map((c) => c.category);
  return (
    <div className="space-y-6">
      <NoEventsFound
        heading={
          organizerMode
            ? `No organizers match ${request.q.trim()}`
            : `No results for "${request.q.trim()}"`
        }
        description={
          organizerMode
            ? "Check the spelling of the handle, or search by name without the @."
            : "Try a shorter or more general term, check the spelling, or browse what's on."
        }
        action={{ label: "Explore events near you", href: "/explore" }}
        compact
      />
      {!organizerMode ? (
        <div className="flex flex-wrap justify-center gap-2">
          {categories.map((category) => (
            <Link
              key={category}
              href={`/search?category=${encodeURIComponent(category)}`}
              className="rounded-full bg-muted px-3 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              {category}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function DiscoveryResults({
  request,
  initial,
  organizerLabel,
  showPlaces,
  showOrganizers,
}: {
  request: SearchRequest;
  initial: SearchResults;
  /** "@username" when results are scoped to one organizer. */
  organizerLabel: string | null;
  showPlaces: boolean;
  showOrganizers: boolean;
}) {
  const onOpen = useClickLogger(initial.searchId);
  const organizerMode = initial.query.kind === "organizer";
  const tabs = TABS.filter(
    (t) =>
      (t.mode !== "places" || showPlaces) &&
      (t.mode !== "organizers" || showOrganizers) &&
      (!organizerMode || t.mode === "organizers" || t.mode === "all") &&
      (!request.organizerId || t.mode === "events"),
  );

  const counts = {
    events: initial.events.items.length,
    places: initial.places.items.length,
    organizers: initial.organizers.items.length,
  };
  const total = counts.events + counts.places + counts.organizers;
  const failed =
    initial.status >= 500 ||
    (initial.events.error && initial.places.error && initial.organizers.error);

  const summary = failed
    ? "Search is unavailable right now."
    : total === 0
      ? "No results."
      : [
          counts.events
            ? `${counts.events}${initial.events.hasNextPage ? "+" : ""} events`
            : null,
          counts.places
            ? `${counts.places}${initial.places.hasNextPage ? "+" : ""} places`
            : null,
          counts.organizers
            ? `${counts.organizers}${initial.organizers.hasNextPage ? "+" : ""} organizers`
            : null,
        ]
          .filter(Boolean)
          .join(", ");

  return (
    <div className="space-y-6">
      {organizerLabel && request.organizerId ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm">
            Events by {organizerLabel}
            <Link
              href={hrefFor(request, { organizerId: null, mode: "all" })}
              aria-label="Show all results"
              className="text-muted-foreground hover:text-foreground"
            >
              <IoClose aria-hidden />
            </Link>
          </span>
        </div>
      ) : null}

      {tabs.length > 1 ? (
        <nav
          aria-label="Result type"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {tabs.map((tab) => {
            const active = tab.mode === request.mode;
            return (
              <Link
                key={tab.mode}
                href={hrefFor(request, { mode: tab.mode })}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={cn(
                  "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground hover:bg-accent",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {summary}
      </p>

      {failed ? (
        <InlineErrorRetry
          message="Search is unavailable right now."
          onRetry={() => window.location.reload()}
        />
      ) : total === 0 ? (
        <NoResults request={request} />
      ) : request.mode === "all" ? (
        <div className="space-y-10">
          {[
            {
              key: "events" as const,
              title: "Events",
              group: initial.events,
              show: !organizerMode,
              body: (
                <ClickableList
                  items={initial.events.items}
                  entityType="event"
                  onOpen={onOpen}
                  render={renderEvent}
                  className={GRID}
                />
              ),
            },
            {
              key: "places" as const,
              title: "Places",
              group: initial.places,
              show: showPlaces && !organizerMode,
              body: (
                <ClickableList
                  items={initial.places.items}
                  entityType="place"
                  onOpen={onOpen}
                  render={renderPlace}
                  className={GRID}
                />
              ),
            },
            {
              key: "organizers" as const,
              title: "Organizers",
              group: initial.organizers,
              show: showOrganizers,
              body: (
                <ClickableList
                  items={initial.organizers.items}
                  entityType="organizer"
                  onOpen={onOpen}
                  render={renderOrganizer}
                  className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
                />
              ),
            },
          ]
            .filter(
              (s) => s.show && (s.group.items.length > 0 || s.group.error),
            )
            .map((section) => (
              <section
                key={section.key}
                aria-labelledby={`search-${section.key}`}
                className="space-y-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2
                    id={`search-${section.key}`}
                    className="text-lg font-semibold text-foreground"
                  >
                    {section.title}
                  </h2>
                  {section.group.hasNextPage ? (
                    <Link
                      href={hrefFor(request, { mode: section.key })}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      See all {section.title.toLowerCase()}
                    </Link>
                  ) : null}
                </div>
                {section.group.error ? (
                  <InlineErrorRetry
                    message={`Couldn't load ${section.title.toLowerCase()}.`}
                    onRetry={() => window.location.reload()}
                  />
                ) : (
                  section.body
                )}
              </section>
            ))}
        </div>
      ) : request.mode === "events" ? (
        <SingleGroup
          request={request}
          initial={initial.events}
          pick={(r) => r.events}
          entityType="event"
          render={renderEvent}
          className={GRID}
          onOpen={onOpen}
        />
      ) : request.mode === "places" ? (
        <SingleGroup
          request={request}
          initial={initial.places}
          pick={(r) => r.places}
          entityType="place"
          render={renderPlace}
          className={GRID}
          onOpen={onOpen}
        />
      ) : (
        <SingleGroup
          request={request}
          initial={initial.organizers}
          pick={(r) => r.organizers}
          entityType="organizer"
          render={renderOrganizer}
          className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
          onOpen={onOpen}
        />
      )}
    </div>
  );
}
