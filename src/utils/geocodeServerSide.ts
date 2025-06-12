// lib/geocode.ts
export async function geocodeAddress(address: string) {
  if (!address) throw new Error("Address is required");

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("Missing Google Maps API Key");

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address,
    )}&key=${apiKey}`,
  );

  const data = await res.json();

  if (data.status === "OK") {
    const location = data.results[0].geometry.location;
    return { lat: location.lat, lng: location.lng };
  }

  throw new Error(data.status || "Geocoding failed");
}
