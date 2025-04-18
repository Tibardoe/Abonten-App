import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 },
      );
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing Google Maps API Key" },
        { status: 500 },
      );
    }

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address,
      )}&key=${apiKey}`,
    );

    const data = await res.json();

    if (data.status === "OK") {
      const location = data.results[0].geometry.location;

      return NextResponse.json({ lat: location.lat, lng: location.lng });
    }

    return NextResponse.json(
      { error: data.status || "Geocoding failed" },
      { status: 500 },
    );
  } catch (error) {
    console.error("Geocode error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
