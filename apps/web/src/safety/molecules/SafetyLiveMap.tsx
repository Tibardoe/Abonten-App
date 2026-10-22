"use client";

import MapMarker from "@/components/atoms/MapMarker";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import type { SafetyLocationPoint } from "@abonten/types/safetyType";
import { Circle, GoogleMap, Polyline } from "@react-google-maps/api";

const containerClass =
  "h-[260px] w-full overflow-hidden rounded-xl md:h-[340px]";

// Where the person is, on the contact's page: their latest position, how
// precise it is (the circle) and the way they came (the last points). The
// map follows the newest position.
export default function SafetyLiveMap({
  point,
  trail,
  label,
}: {
  point: SafetyLocationPoint;
  trail: SafetyLocationPoint[];
  label: string;
}) {
  const { isLoaded, mapId, colorScheme } = useGoogleMaps();
  if (!isLoaded) {
    return <div className={`${containerClass} animate-pulse bg-muted`} />;
  }
  const center = { lat: point.lat, lng: point.lng };
  return (
    <GoogleMap
      key={colorScheme}
      mapContainerClassName={containerClass}
      center={center}
      zoom={16}
      options={{
        mapId,
        colorScheme,
        fullscreenControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        gestureHandling: "cooperative",
      }}
    >
      {trail.length > 1 ? (
        <Polyline
          path={trail.map((p) => ({ lat: p.lat, lng: p.lng }))}
          options={{
            strokeColor: "#007291",
            strokeOpacity: 0.7,
            strokeWeight: 4,
          }}
        />
      ) : null}
      {point.accuracyM ? (
        <Circle
          center={center}
          radius={point.accuracyM}
          options={{
            fillColor: "#007291",
            fillOpacity: 0.12,
            strokeColor: "#007291",
            strokeOpacity: 0.4,
            strokeWeight: 1,
            clickable: false,
          }}
        />
      ) : null}
      <MapMarker position={center} title={label} />
    </GoogleMap>
  );
}
