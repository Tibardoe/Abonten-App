const getFormattedPlaceDetails = (placeId: string) => {
  return new Promise<google.maps.places.PlaceResult>((resolve, reject) => {
    const service = new google.maps.places.PlacesService(
      document.createElement("div"),
    );

    service.getDetails(
      {
        placeId,
        fields: ["formatted_address", "address_components", "geometry", "name"],
      },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place) {
          resolve(place);
        } else {
          reject("Failed to fetch place details");
        }
      },
    );
  });
};
