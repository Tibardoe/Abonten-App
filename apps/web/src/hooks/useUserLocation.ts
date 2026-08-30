import { logger } from "@abonten/core/logger";
import { useQuery } from "@tanstack/react-query";

function fetchTownFromGeolocation(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      logger.debug("Geolocation not supported by this browser");
      resolve(null);
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

            for (const component of addressComponents) {
              if (component.types.includes("sublocality_level_1")) {
                town = component.long_name;
                break;
              }
              if (component.types.includes("locality") && !town) {
                town = component.long_name;
                break;
              }
            }

            resolve(town || "Unknown Location");
          } else {
            resolve(null);
          }
        } catch (error) {
          logger.error("Error fetching location:", error);
          resolve(null);
        }
      },
      (error) => {
        // Permission denied / unavailable / timeout are all normal outcomes
        // (the user simply declined) and are handled by resolving null.
        logger.debug("Geolocation unavailable:", error.message);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

// Shared with every consumer (Header, SideBar, MobileNavBar, ...) — one
// geolocation prompt + reverse-geocode call per session instead of one per
// mounted component, since the user's location doesn't change mid-session.
export function useGetUserLocation() {
  const { data } = useQuery({
    queryKey: ["user-location"],
    queryFn: fetchTownFromGeolocation,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  return data ?? null;
}
