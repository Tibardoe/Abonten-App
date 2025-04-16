export const getCoordinatesFromAddress = (
  address: string,
): Promise<{ lat: number; lng: number }> => {
  return new Promise((resolve, reject) => {
    if (!window.google) {
      reject("Google Maps JS API is not loaded");
      return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results && results.length > 0) {
        const location = results[0].geometry.location;
        resolve({ lat: location.lat(), lng: location.lng() });
      } else {
        reject(`Geocoding failed: ${status}`);
      }
    });
  });
};
