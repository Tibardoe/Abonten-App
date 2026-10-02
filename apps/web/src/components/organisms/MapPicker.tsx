"use client";

import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { useToast } from "@/hooks/useToast";
import { animateMarkerTo } from "@/utils/animateMarker";
import type { ResolvedLocation } from "@abonten/types/resolvedLocation";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useTranslations } from "next-intl";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { TbLocation } from "react-icons/tb";

const containerClass =
  "w-full h-[500px] md:h-[300px] rounded-lg overflow-hidden";

interface MapPickerProps {
  onLocationSelect: (coords: ResolvedLocation) => void;
  defaultCenter: { lat: number; lng: number };
  center?: { lat: number; lng: number };
}

const MapPicker: React.FC<MapPickerProps> = ({
  onLocationSelect,
  defaultCenter,
  center,
}) => {
  const t = useTranslations("common");
  const toast = useToast();

  const [markerPosition, setMarkerPosition] = useState(center || defaultCenter);

  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);

  const mapRef = useRef<google.maps.Map | null>(null); // for centering map programmatically

  const { isLoaded } = useGoogleMaps();

  useEffect(() => {
    if (isLoaded && !geocoder) {
      setGeocoder(new window.google.maps.Geocoder());
    }
  }, [isLoaded, geocoder]);
  const reverseGeocode = (lat: number, lng: number) => {
    if (!geocoder) return;

    const latlng = { lat, lng };
    geocoder.geocode({ location: latlng }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const address = results[0].formatted_address;
        onLocationSelect({ lat, lng, address });
      } else {
        onLocationSelect({ lat, lng, address: t("unknownLocation") });
      }
    });
  };

  const handleMapInteraction = (lat: number, lng: number) => {
    const newCoords = { lat, lng };

    if (mapRef.current) {
      mapRef.current.panTo(newCoords); // Smoothly pan the map to new location
    }

    animateMarkerTo(
      markerPosition,
      newCoords,
      500, // duration in ms
      setMarkerPosition,
    );

    setMarkerPosition(newCoords);
    reverseGeocode(lat, lng);
  };

  const locateUser = () => {
    if (!navigator.geolocation) {
      toast.error(t("geolocationIsNotSupportedByYour"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        handleMapInteraction(latitude, longitude);
      },
      () => {
        toast.error(t("unableToRetrieveYourLocation"));
      },
    );
  };

  useEffect(() => {
    if (center) {
      setMarkerPosition(center); // Update marker position whenever center changes
    }
  }, [center]);

  if (!isLoaded) return <p>{t("loadingMap")}</p>;

  return (
    <div className="relative">
      <GoogleMap
        mapContainerClassName={containerClass}
        center={markerPosition}
        zoom={15}
        onLoad={(map) => {
          mapRef.current = map;
        }}
        onClick={(e) => {
          if (e.latLng) {
            handleMapInteraction(e.latLng.lat(), e.latLng.lng());
          }
        }}
        options={{
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
          gestureHandling: "greedy",
        }}
      >
        <Marker
          position={markerPosition}
          title={t("moveThePinToYourPreferred")}
          draggable
          onDragEnd={(e) => {
            if (e.latLng) {
              handleMapInteraction(e.latLng.lat(), e.latLng.lng());
            }
          }}
        />
      </GoogleMap>

      <button
        type="button"
        onClick={locateUser}
        className="absolute z-10 bottom-3 left-3 bg-popover grid place-items-center rounded-full p-3 text-popover-foreground font-bold text-xl shadow"
      >
        <TbLocation />
      </button>
    </div>
  );
};

export default MapPicker;
