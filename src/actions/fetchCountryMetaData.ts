"use server";
import { countryDetails } from "@/data/countryDetails";
import { cookies } from "next/headers";

export async function fetchCountryMetadata() {
  const fetchedCountry = (await cookies()).get("country")?.value ?? "unknown";

  const details = countryDetails.find(
    (item) => item.countryCode === fetchedCountry,
  );

  // Falls back to Ghana (also proxy.ts's own default when no IP-country
  // header is present) rather than leaving the caller with nothing --
  // otherwise the phone country code goes unselected on a first visit
  // (before the "country" cookie exists) or for a country outside this
  // curated list.
  return details ?? countryDetails.find((item) => item.countryCode === "GH");
}

// Check cookies for country
// If theres country, check if the current country is the same as the one in the cookies
// If they are, fetch their corresponding metadata
// if they are not, update with new country
// If there is no country, call API to fetch currennt country details
//
