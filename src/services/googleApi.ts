type GeocodeResponse = {
  results: {
    types: string[];
    address_components: { long_name: string }[];
  }[];
};

export const fetchUserCountry = async () => {
  const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  try {
    const res = await fetch(
      `https://www.googleapis.com/geolocation/v1/geolocate?key=${googleApiKey}`,
      { method: "POST" },
    );

    const data = await res.json();

    if (data.location) {
      const { lat, lng } = data.location;
      return { lat, lng };
    }
  } catch (error) {
    console.error("Error fetching location:", error);
  }
};

export const fetchCountryCode = async (lat: number, lng: number) => {
  const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleApiKey}`,
    );

    const data: GeocodeResponse = await res.json();

    if (data.results.length > 0) {
      const country = data.results.find((result) =>
        result.types.includes("country"),
      );

      if (country) {
        const countryName = country.address_components[0].long_name;
        const restCountriesRes = await fetch(
          `https://restcountries.com/v3.1/name/${countryName}?fields=idd`,
        );

        const restData = await restCountriesRes.json();

        if (restData.length > 0 && restData[0].idd) {
          const dialCode =
            restData[0].idd.root + (restData[0].idd.suffixes?.[0] || "");
          return dialCode;
        }
      }
    }
  } catch (error) {
    console.error("Error fetching country name:", error);
  }
};
