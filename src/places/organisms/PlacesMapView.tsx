"use client";

import StarRatingDisplay from "@/components/atoms/Rating";
import { useClickOutside } from "@/hooks/useClickOutside";
import type { PlaceType } from "@/types/placeType";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { derivePlaceCardOpenStatus } from "@/utils/computePlaceOpenStatus";
import { parseWKBHex } from "@/utils/parseWKBHex";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import Image from "next/image";
import Link from "next/link";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IoClose, IoLocationOutline } from "react-icons/io5";
import PlaceOpenStatusBadge from "../molecules/PlaceOpenStatusBadge";
import VerifiedBadge from "../molecules/VerifiedBadge";

const containerClass =
  "w-full h-[500px] md:h-[600px] rounded-lg overflow-hidden";

// Ghana-wide fallback center (matches this codebase's existing GH-default
// assumption, e.g. proxy.ts's default country code) — only ever used if
// `places` somehow contains zero parseable locations, since the empty-state
// branch below normally short-circuits before the map ever mounts.
const FALLBACK_CENTER = { lat: 5.6037, lng: -0.187 };

type PlaceMarker = { place: PlaceType; lat: number; lng: number };

// Multi-marker map rendering of the Places tab's "All Places" section
// (Places Phase 2, Milestone 3) — a sibling view to AllPlacesList.tsx's list
// rendering, driven by the same getQueriedPlaces filters but fetched once as
// a single bounded pageSize:100 page (see PlacesTabContent.tsx) rather than
// cursor-paginated, since a map can't usefully "load more" the way an
// infinite list scroll can.
//
// Follows MapPicker.tsx's useJsApiLoader/API-key wiring, but unlike that
// component (single draggable marker, fixed zoom/panTo) this renders one
// static Marker per place and auto-fits the viewport to all of them via
// map.fitBounds — a small, justified addition not used elsewhere in this
// codebase, since MapPicker never has more than one point to frame.
export default function PlacesMapView({ places }: { places: PlaceType[] }) {
  const [selectedPlace, setSelectedPlace] = useState<PlaceType | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("Google Maps API key is missing.");
  }

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: ["places"],
  });

  // Parsed once per `places` change -- PlaceType.location is a raw PostGIS
  // WKB hex string (see parseWKBHex.ts, already used by GetDirectionBtn.tsx
  // for the same format). A place with an unparseable location is skipped
  // rather than crashing the whole map.
  const markers = useMemo<PlaceMarker[]>(() => {
    return places.flatMap((place) => {
      try {
        const { eventLat, eventLng } = parseWKBHex(place.location);
        return [{ place, lat: eventLat, lng: eventLng }];
      } catch {
        return [];
      }
    });
  }, [places]);

  useClickOutside(selectedPlace ? [panelRef] : [], () =>
    setSelectedPlace(null),
  );

  // Keyboard-dismissible, same "Escape closes an open overlay" convention as
  // CreateMenu.tsx.
  useEffect(() => {
    if (!selectedPlace) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedPlace(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedPlace]);

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

      // fitBounds can over-zoom when every marker sits close together (e.g.
      // several places in the same building) -- cap it once the
      // bounds-driven zoom settles, same "don't zoom in past street level"
      // ceiling MapPicker.tsx's fixed zoom={15} implies for the
      // single-marker case.
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

  // Re-fit whenever the filtered place set changes (e.g. a category chip or
  // filter is applied while already in map view).
  useEffect(() => {
    if (mapRef.current) fitToMarkers(mapRef.current);
  }, [fitToMarkers]);

  if (!isLoaded) return <p>Loading map...</p>;

  if (markers.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground text-sm">
        No places to show on the map.
      </div>
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
        {markers.map(({ place, lat, lng }) => (
          <Marker
            key={place.id}
            position={{ lat, lng }}
            onClick={() => setSelectedPlace(place)}
          />
        ))}
      </GoogleMap>

      {selectedPlace && (
        <PlacePreviewPanel
          place={selectedPlace}
          panelRef={panelRef}
          onClose={() => setSelectedPlace(null)}
        />
      )}
    </div>
  );
}

// Compact marker-click preview. Hand-rolled absolute-positioned overlay
// (no shadcn Dialog / no InfoWindow — matches this codebase's existing
// custom-overlay convention, e.g. CreateMenu.tsx/ReviewModal.tsx) rather
// than Google's built-in InfoWindow, which is too cramped for an image +
// rating + badges and re-themes poorly against this app's dark-mode tokens.
// The same element is a bottom sheet on mobile and a side panel on desktop
// purely via responsive classes (no JS viewport detection needed) — the
// same technique ReviewModal.tsx already uses for its own
// "self-end md:self-center" modal repositioning.
function PlacePreviewPanel({
  place,
  panelRef,
  onClose,
}: {
  place: PlaceType;
  panelRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const openStatus = derivePlaceCardOpenStatus(
    place.is_open,
    place.temporary_status,
  );
  const fullAddress =
    (place.address as { full_address?: string })?.full_address ??
    "Location not specified";

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

      <Link href={`/places/${place.slug}`} className="block">
        <div className="relative h-32 w-full">
          <Image
            src={buildCloudinaryUrl(
              place.cover_public_id,
              place.cover_version,
              {
                width: 320,
                height: 128,
              },
            )}
            alt={`Cover photo for ${place.name}`}
            fill
            className="object-cover"
            sizes="320px"
          />
        </div>

        <div className="p-3 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <h3 className="font-medium line-clamp-1">{place.name}</h3>
            {place.verified && <VerifiedBadge />}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded-full text-xs">
              {place.category_name}
            </span>
            <PlaceOpenStatusBadge status={openStatus} className="text-xs" />
          </div>

          <div className="flex items-center gap-1.5">
            <StarRatingDisplay rating={place.avg_rating ?? 0} />
            <span className="text-xs text-muted-foreground">
              ({place.review_count})
            </span>
          </div>

          <div className="flex items-start gap-1.5 text-muted-foreground">
            <IoLocationOutline className="mt-0.5 flex-shrink-0" />
            <p className="text-xs line-clamp-1">{fullAddress}</p>
          </div>
        </div>
      </Link>
    </div>
  );
}
