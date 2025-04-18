"use client";

import { animateMarkerTo } from "@/utils/animateMarker";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { TbLocation } from "react-icons/tb";

const containerClass =
  "w-full h-[500px] md:h-[300px] rounded-lg overflow-hidden";

interface MapPickerProps {
  onLocationSelect: (coords: {
    lat: number;
    lng: number;
    address: string;
  }) => void;
  defaultCenter: { lat: number; lng: number };
  center?: { lat: number; lng: number };
}

const MapPicker: React.FC<MapPickerProps> = ({
  onLocationSelect,
  defaultCenter,
  center,
}) => {
  const [markerPosition, setMarkerPosition] = useState(center || defaultCenter);

  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);

  const mapRef = useRef<google.maps.Map | null>(null); // for centering map programmatically

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("Google Maps API key is missing.");
  }

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: ["places"], // just in case
  });

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
        onLocationSelect({ lat, lng, address: "Unknown location" });
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
      alert("Geolocation is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        handleMapInteraction(latitude, longitude);
      },
      () => {
        alert("Unable to retrieve your location.");
      },
    );
  };

  useEffect(() => {
    if (center) {
      setMarkerPosition(center); // Update marker position whenever center changes
    }
  }, [center]);

  if (!isLoaded) return <p>Loading map...</p>;

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
        className="absolute z-10 bottom-3 left-3 bg-black grid place-items-center rounded-full p-3 text-white font-bold text-xl shadow"
      >
        <TbLocation />
      </button>
    </div>
  );
};

export default MapPicker;
