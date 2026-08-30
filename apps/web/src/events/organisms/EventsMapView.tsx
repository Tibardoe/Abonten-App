"use client";

import { useClickOutside } from "@/hooks/useClickOutside";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getFormattedEventDate } from "@abonten/core/dateFormatter";
import { parseWKBHex } from "@abonten/core/parseWKBHex";
import type { UserPostType } from "@abonten/types/postsType";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IoClose, IoLocationOutline } from "react-icons/io5";
import { MdOutlineDateRange } from "react-icons/md";
import NoEventsFound from "../molecules/NoEventsFound";

const GOOGLE_MAPS_LIBRARIES: "places"[] = ["places"];

const containerClass =
  "w-full h-[500px] md:h-[600px] rounded-lg overflow-hidden";

// Ghana-wide fallback center, same default assumed elsewhere in this
// codebase (see PlacesMapView.tsx) — only used if `events` somehow contains
// zero parseable locations, since the empty-state branch below normally
// short-circuits before the map ever mounts.
const FALLBACK_CENTER = { lat: 5.6037, lng: -0.187 };

type EventMarker = { event: UserPostType; lat: number; lng: number };

// Multi-marker map rendering of the Explore page's Events tab "All Events"
// section — a sibling view to AllEventsList.tsx's list rendering, driven by
// the same getQueriedEvents filters but fetched once as a single bounded
// page (see EventsTabContent.tsx) rather than cursor-paginated, mirroring
// PlacesMapView.tsx's rationale exactly (a map can't usefully "load more"
// the way an infinite scroll list can). Every event has a real point
// (event.location and event.address are both NOT NULL in the schema, no
// online/virtual-event concept exists) so there's no "online event" branch
// to special-case.
export default function EventsMapView({
  events,
  location,
  eventCategory,
}: {
  events: UserPostType[];
  location: string;
  eventCategory?: string | null;
}) {
  const [selectedEvent, setSelectedEvent] = useState<UserPostType | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("Google Maps API key is missing.");
  }

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  // Parsed once per `events` change — UserPostType.location is a raw
  // PostGIS WKB hex string (see parseWKBHex.ts). An event with a
  // missing/unparseable location is skipped rather than crashing the map.
  const markers = useMemo<EventMarker[]>(() => {
    return events.flatMap((event) => {
      if (!event.location) return [];
      try {
        const { eventLat, eventLng } = parseWKBHex(event.location);
        return [{ event, lat: eventLat, lng: eventLng }];
      } catch {
        return [];
      }
    });
  }, [events]);

  useClickOutside(selectedEvent ? [panelRef] : [], () =>
    setSelectedEvent(null),
  );

  useEffect(() => {
    if (!selectedEvent) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedEvent(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedEvent]);

  const fitToMarkers = useCallback(
    (map: google.maps.Map) => {
      if (markers.length === 0) return;

      if (markers.length === 1) {
        map.setCenter({ lat: markers[0].lat, lng: markers[0].lng });
        map.setZoom(15);
        return;
      }

      const bounds = new window.google.maps.LatLngBounds();
      for (const marker of markers) {
        bounds.extend({ lat: marker.lat, lng: marker.lng });
      }
      map.fitBounds(bounds);

      window.google.maps.event.addListenerOnce(map, "bounds_changed", () => {
        const zoom = map.getZoom();
        if (zoom != null && zoom > 16) map.setZoom(16);
      });
    },
    [markers],
  );

  const handleMapLoad = (map: google.maps.Map) => {
    mapRef.current = map;
    fitToMarkers(map);
  };

  useEffect(() => {
    if (mapRef.current) fitToMarkers(mapRef.current);
  }, [fitToMarkers]);

  if (!isLoaded) return <p>Loading map...</p>;

  if (markers.length === 0) {
    const listParams = new URLSearchParams(searchParams.toString());
    listParams.set("view", "list");

    return (
      <NoEventsFound
        compact
        heading="No events to show on the map"
        description={
          eventCategory
            ? `None of the ${eventCategory} events in ${location} have a mappable location yet.`
            : `None of the events in ${location} have a mappable location yet.`
        }
        action={{
          label: "Switch to list view",
          href: `${pathname}?${listParams.toString()}`,
        }}
      />
    );
  }

  const initialCenter = markers[0] ?? FALLBACK_CENTER;

  return (
    <div className="relative">
      <GoogleMap
        mapContainerClassName={containerClass}
        center={{ lat: initialCenter.lat, lng: initialCenter.lng }}
        zoom={13}
        onLoad={handleMapLoad}
        options={{
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
          gestureHandling: "greedy",
        }}
      >
        {markers.map(({ event, lat, lng }) => (
          <Marker
            key={event.id}
            position={{ lat, lng }}
            onClick={() => setSelectedEvent(event)}
          />
        ))}
      </GoogleMap>

      {selectedEvent && (
        <EventPreviewPanel
          event={selectedEvent}
          panelRef={panelRef}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

// Compact marker-click preview, matching PlacesMapView.tsx's
// PlacePreviewPanel treatment (hand-rolled overlay, bottom sheet on mobile /
// side panel on desktop via responsive classes only).
function EventPreviewPanel({
  event,
  panelRef,
  onClose,
}: {
  event: UserPostType;
  panelRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const dateTime = getFormattedEventDate(
    event.starts_at,
    event.ends_at,
    event.occurrences,
  );

  return (
    <div
      ref={panelRef}
      className="absolute z-10 inset-x-0 bottom-0 rounded-t-xl md:inset-x-auto md:top-0 md:right-0 md:bottom-0 md:left-auto md:w-80 md:rounded-t-none md:rounded-l-xl bg-card text-card-foreground shadow-xl border border-border overflow-hidden"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute top-2 right-2 z-10 grid place-items-center rounded-full bg-popover text-popover-foreground p-1.5 shadow"
      >
        <IoClose className="text-lg" />
      </button>

      <Link
        href={`/events/${event.event_code.toLowerCase()}`}
        className="block"
      >
        <div className="relative h-32 w-full">
          <Image
            src={buildCloudinaryUrl(
              event.flyer_public_id,
              event.flyer_version,
              {
                width: 320,
                height: 128,
              },
            )}
            alt={`Flyer for ${event.title}`}
            fill
            className="object-cover"
            sizes="320px"
          />
        </div>

        <div className="p-3 space-y-1.5">
          <h3 className="font-medium line-clamp-1">{event.title}</h3>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MdOutlineDateRange className="flex-shrink-0" />
            <span className="text-xs">
              {dateTime.date} · {dateTime.time}
            </span>
          </div>

          <div className="flex items-start gap-1.5 text-muted-foreground">
            <IoLocationOutline className="mt-0.5 flex-shrink-0" />
            <p className="text-xs line-clamp-1">
              {event.address?.full_address || "Location not specified"}
            </p>
          </div>

          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-primary text-primary-foreground">
            {event.min_price === 0 || event.min_price == null
              ? "Free Entry"
              : `${event.currency} ${event.min_price?.toLocaleString()}`}
          </span>
        </div>
      </Link>
    </div>
  );
}
