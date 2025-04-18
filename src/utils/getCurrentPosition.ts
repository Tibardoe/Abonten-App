export const getCurrentPosition = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported"));
    }

    navigator.geolocation.getCurrentPosition(resolve, reject);
  });
};
