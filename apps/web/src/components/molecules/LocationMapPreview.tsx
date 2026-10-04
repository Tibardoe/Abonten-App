"use client";

import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { parseWKBHex } from "@abonten/core/parseWKBHex";
import { GoogleMap } from "@react-google-maps/api";
import MapMarker from "../atoms/MapMarker";

const containerClass =
  "w-full h-[180px] md:h-[220px] rounded-lg overflow-hidden";

type LocationMapPreviewProps = {
  // Raw PostGIS WKB hex string -- same format event.location/place.location
  // already carry, parsed the same way GetDirectionBtn.tsx does.
  location: string;
  /** What the pin marks (the address): its name for a screen reader. */
  label?: string;
  className?: string;
};

// Read-only single-marker map for the event/place detail pages' Location
// card, so it shows *where* instead of only an address string. Unlike
// MapPicker (draggable marker, used when creating/editing) or PlacesMapView
// (multi-marker browse view with a selection panel), this has no
// interaction beyond the map's own default pan/zoom.
export default function LocationMapPreview({
  location,
  label,
  className,
}: LocationMapPreviewProps) {
  const { isLoaded, mapId, colorScheme } = useGoogleMaps();

  let center: { lat: number; lng: number };
  try {
    const { eventLat, eventLng } = parseWKBHex(location);
    center = { lat: eventLat, lng: eventLng };
  } catch {
    return null;
  }

  if (!isLoaded) {
    return (
      <div
        className={`${containerClass} bg-muted animate-pulse ${className ?? ""}`}
      />
    );
  }

  return (
    <GoogleMap
      key={colorScheme}
      mapContainerClassName={`${containerClass} ${className ?? ""}`}
      center={center}
      zoom={15}
      options={{
        mapId,
        colorScheme,
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        gestureHandling: "cooperative",
      }}
    >
      <MapMarker position={center} title={label} />
    </GoogleMap>
  );
}
