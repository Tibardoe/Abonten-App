type FilterParams = {
  price?: string;
  rating?: string;
  distance?: string;
  from?: string;
  to?: string;
  lat?: string;
  lng?: string;
};

export function parseFilters(params: FilterParams) {
  // Price example: "GHS 0 - GHS 250" -> extract 0 and 250 as numbers
  let minPrice = 0;
  let maxPrice = 999999; // large number for "any"
  if (params.price) {
    const priceMatch = params.price.match(/(\d+)\s*-\s*(\d+|any)/i);
    if (priceMatch) {
      minPrice = Number(priceMatch[1]);
      maxPrice =
        priceMatch[2].toLowerCase() === "any" ? 999999 : Number(priceMatch[2]);
    }
  }

  // Rating example: "From 4.5" -> parse to number 4.5
  const minRating = params.rating
    ? Number.parseFloat(params.rating.replace(/[^\d.]/g, ""))
    : 0;

  // Distance example: "Up to 3km" -> parse number 3
  const maxDistanceKm = params.distance
    ? Number.parseFloat(params.distance.replace(/[^\d.]/g, ""))
    : 10000; // big number if not specified

  // Dates
  const startDate = params.from ? new Date(params.from).toISOString() : null;
  const endDate = params.to ? new Date(params.to).toISOString() : null;

  // Latitude and Longitude
  const lat = params.lat ? Number(params.lat) : null;
  const lng = params.lng ? Number(params.lng) : null;

  return {
    minPrice,
    maxPrice,
    minRating,
    maxDistanceKm,
    startDate,
    endDate,
    lat,
    lng,
  };
}
