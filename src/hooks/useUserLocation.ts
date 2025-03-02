import { fetchCountryCode, fetchUserCountry } from "@/services/googleApi";
import { useEffect, useState } from "react";

export default function useUserLocation() {
  const [dialCode, setDialCode] = useState("");

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
