"use client";

import { parseWKBHex } from "@/utils/parseWKBHex";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

const containerClass =
  "w-full h-[180px] md:h-[220px] rounded-lg overflow-hidden";

type LocationMapPreviewProps = {
  // Raw PostGIS WKB hex string -- same format event.location/place.location
  // already carry, parsed the same way GetDirectionBtn.tsx does.
  location: string;
  className?: string;
};

// Read-only single-marker map for the event/place detail pages' Location
// card, so it shows *where* instead of only an address string. Unlike
// MapPicker (draggable marker, used when creating/editing) or PlacesMapView
// (multi-marker browse view with a selection panel), this has no
// interaction beyond the map's own default pan/zoom.
export default function LocationMapPreview({
  location,
  className,
}: LocationMapPreviewProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("Google Maps API key is missing.");
  }

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: ["places"],
  });

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
      mapContainerClassName={`${containerClass} ${className ?? ""}`}
      center={center}
      zoom={15}
      options={{
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        gestureHandling: "cooperative",
      }}
    >
      <Marker position={center} />
    </GoogleMap>
  );
}
