"use client";

import { useGoogleMap } from "@react-google-maps/api";
import { useEffect, useRef, useState } from "react";

type MapMarkerProps = {
  position: google.maps.LatLngLiteral;
  /** What the pin marks: its name for a screen reader and on hover. */
  title?: string;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: (position: google.maps.LatLngLiteral) => void;
};

/**
 * One pin on the surrounding <GoogleMap>, drawn as Google's advanced
 * marker (google.maps.Marker is deprecated). The map needs a Map ID:
 * useGoogleMaps hands one to every map.
 *
 * The marker is created once per map; position, title and handlers are
 * updated in place, so a dragged or animated pin is never re-created.
 */
export default function MapMarker({
  position,
  title,
  onClick,
  draggable = false,
  onDragStart,
  onDragEnd,
}: MapMarkerProps) {
  const map = useGoogleMap();
  const [marker, setMarker] =
    useState<google.maps.marker.AdvancedMarkerElement | null>(null);
  const onClickRef = useRef(onClick);
  const onDragStartRef = useRef(onDragStart);
  const onDragEndRef = useRef(onDragEnd);

  useEffect(() => {
    onClickRef.current = onClick;
    onDragStartRef.current = onDragStart;
    onDragEndRef.current = onDragEnd;
  }, [onClick, onDragStart, onDragEnd]);

  useEffect(() => {
    if (!map) return;
    const created = new google.maps.marker.AdvancedMarkerElement({ map });
    // Google's "gmp-" DOM events; the older addListener ones are deprecated.
    const handleClick = () => onClickRef.current?.();
    const handleDragStart = () => onDragStartRef.current?.();
    const handleDragEnd = () => {
      const at = created.position;
      if (!at) return;
      onDragEndRef.current?.(
        at instanceof google.maps.LatLng
          ? at.toJSON()
          : { lat: at.lat, lng: at.lng },
      );
    };
    created.addEventListener("gmp-click", handleClick);
    created.addEventListener("gmp-dragstart", handleDragStart);
    created.addEventListener("gmp-dragend", handleDragEnd);
    setMarker(created);
    return () => {
      created.removeEventListener("gmp-click", handleClick);
      created.removeEventListener("gmp-dragstart", handleDragStart);
      created.removeEventListener("gmp-dragend", handleDragEnd);
      created.map = null;
      setMarker(null);
    };
  }, [map]);

  const { lat, lng } = position;
  useEffect(() => {
    if (marker) marker.position = { lat, lng };
  }, [marker, lat, lng]);

  const clickable = Boolean(onClick);
  useEffect(() => {
    if (!marker) return;
    marker.title = title ?? "";
    marker.gmpClickable = clickable;
    marker.gmpDraggable = draggable;
  }, [marker, title, clickable, draggable]);

  return null;
}
