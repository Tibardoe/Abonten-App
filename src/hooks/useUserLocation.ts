import { fetchCountryCode, fetchUserCountry } from "@/services/googleApi";
import { useEffect, useState } from "react";

export default function useUserLocation() {
  const [dialCode, setDialCode] = useState<string | null>(null);

  useEffect(() => {
    const getUserLocation = async () => {
      const location = await fetchUserCountry();

      if (location) {
        const code = await fetchCountryCode(location.lat, location.lng);
        setDialCode(code);
      }
    };

    getUserLocation();
  }, []);

  return dialCode;
}

export function getUserLocation() {
  const [location, setLocation] = useState<string | null>(null);

  useEffect(() => {
    const fetchLocation = async () => {
      if (!navigator.geolocation) {
        console.error("Geolocation not supported");
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

          try {
            const res = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${googleApiKey}`,
            );

            const data = await res.json();

            if (data.results.length > 0) {
              const addressComponents = data.results[0].address_components;

              let town = null;

              // Search for the most specific location (sublocality or locality)
              for (const component of addressComponents) {
                if (component.types.includes("sublocality_level_1")) {
                  town = component.long_name; // Example: "Kokrobite"
                  break;
                }
                if (component.types.includes("locality") && !town) {
                  town = component.long_name; // Fallback to city
                  break;
                }
              }

              if (!town) {
                console.warn(
                  "Could not determine specific town, using default city.",
                );
                town = "Unknown Location";
              }

              setLocation(town);
            }
          } catch (error) {
            console.error("Error fetching location:", error);
          }
        },
        (error) => console.error("Geolocation error:", error),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    };

    fetchLocation();
  }, []);

  return location;
}
