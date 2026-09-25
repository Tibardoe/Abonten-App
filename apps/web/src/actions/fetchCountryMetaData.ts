"use server";
import { countryDetails } from "@/data/countryDetails";
import { getDefaultMarket } from "@abonten/services/markets/marketConfig";
import { cookies } from "next/headers";

/**
 * The visitor's country for the phone-number picker: the "country" cookie
 * the proxy keeps from the request's IP country, else the default market
 * (never a fixed country), so the dial code is always pre-selected.
 */
export async function fetchCountryMetadata() {
  const fetchedCountry = (await cookies()).get("country")?.value ?? "unknown";

  const details = countryDetails.find(
    (item) => item.countryCode === fetchedCountry.toUpperCase(),
  );
  if (details) return details;

  const fallback = (await getDefaultMarket()).countryCode;
  return countryDetails.find((item) => item.countryCode === fallback);
}
