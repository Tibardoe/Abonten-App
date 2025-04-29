"use server";

export async function getUserCurrency(): Promise<string> {
  try {
    const res = await fetch("https://ipapi.co/json/");

    if (
      !res.ok ||
      !res.headers.get("content-type")?.includes("application/json")
    ) {
      throw new Error(`Non-JSON or failed response: ${res.statusText}`);
    }

    const data = await res.json();

    return data.currency || "USD"; // default to USD if not available
  } catch (error) {
    console.error("Failed to fetch user currency", error);
    return "USD";
  }
}
