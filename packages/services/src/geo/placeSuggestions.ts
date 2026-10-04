// Address suggestions for the app, from Google Places API (New), asked by
// the server.
//
// The app used to call Google's Places web service from the phone with a
// key built into the app, where anyone can read it. The server holds the
// key now (googleMapsServerKey) and the routes are rate limited.
//
// Suggestions are limited to the countries Abonten is open in, as on the
// website, and biased towards the area being browsed. One session token
// from the app covers the typing and the place it ends on: Google bills a
// session as one lookup. The chosen place is asked for its location and
// address only, the cheapest Place Details fields.

import { googleMapsLanguage } from "@abonten/core/geo/googleLanguage";
import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";
import { tr } from "../i18n/requestLocale";
import { listPublicMarkets } from "../markets/marketConfig";
import { googleMapsServerKey } from "./googleMapsKey";

export type PlaceSuggestionItem = {
  placeId: string;
  primary: string;
  secondary: string;
};

export type ResolvedPlaceItem = { lat: number; lng: number; address: string };

type Envelope<T> = { status: number; message?: string; data?: T };

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_URL = "https://places.googleapis.com/v1/places/";
// Places (New) takes a bias circle of at most 50 km.
const BIAS_RADIUS_METRES = 50_000;
const MAX_SUGGESTIONS = 5;
// Google restricts to at most fifteen countries; with more open markets the
// bias alone narrows the list.
const MAX_REGION_CODES = 15;
export const MIN_QUERY_LENGTH = 3;

type AutocompleteResponse = {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }[];
};

type DetailsResponse = {
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
};

function unavailable<T>(): Envelope<T> {
  return { status: 503, message: tr("locationLookupUnavailable") };
}

export async function suggestPlacesCore(input: {
  q: string;
  session: string;
  lat?: number;
  lng?: number;
  locale: string;
}): Promise<Envelope<PlaceSuggestionItem[]>> {
  const query = input.q.trim();
  if (query.length < MIN_QUERY_LENGTH) return { status: 200, data: [] };
  const key = googleMapsServerKey();
  if (!key) return unavailable();

  const regionCodes = (await listPublicMarkets()).map((m) =>
    m.countryCode.toLowerCase(),
  );
  const body = {
    input: query,
    sessionToken: input.session,
    languageCode: googleMapsLanguage(input.locale),
    ...(regionCodes.length > 0 &&
      regionCodes.length <= MAX_REGION_CODES && {
        includedRegionCodes: regionCodes,
      }),
    ...(input.lat != null &&
      input.lng != null && {
        locationBias: {
          circle: {
            center: { latitude: input.lat, longitude: input.lng },
            radius: BIAS_RADIUS_METRES,
          },
        },
      }),
  };

  try {
    const res = await fetchWithTimeout(AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat",
      },
      body: JSON.stringify(body),
      timeoutMs: HTTP_TIMEOUTS.googlePlaces,
      cache: "no-store",
    });
    if (!res.ok) {
      logger.warn(`placeSuggestions: autocomplete answered ${res.status}`);
      return unavailable();
    }
    const json = (await res.json()) as AutocompleteResponse;
    const items = (json.suggestions ?? []).flatMap(({ placePrediction: p }) => {
      if (!p?.placeId) return [];
      const primary = p.structuredFormat?.mainText?.text ?? p.text?.text ?? "";
      if (!primary) return [];
      return [
        {
          placeId: p.placeId,
          primary,
          secondary: p.structuredFormat?.secondaryText?.text ?? "",
        },
      ];
    });
    return { status: 200, data: items.slice(0, MAX_SUGGESTIONS) };
  } catch (error) {
    logger.warn("placeSuggestions: autocomplete failed", error);
    return unavailable();
  }
}

export async function resolvePlaceCore(input: {
  placeId: string;
  session: string;
  locale: string;
}): Promise<Envelope<ResolvedPlaceItem>> {
  const key = googleMapsServerKey();
  if (!key) return unavailable();

  const qs = new URLSearchParams({
    sessionToken: input.session,
    languageCode: googleMapsLanguage(input.locale),
  });
  try {
    const res = await fetchWithTimeout(
      `${DETAILS_URL}${encodeURIComponent(input.placeId)}?${qs.toString()}`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "location,formattedAddress",
        },
        timeoutMs: HTTP_TIMEOUTS.googlePlaces,
        cache: "no-store",
      },
    );
    if (res.status === 404 || res.status === 400) {
      return { status: 404, message: tr("thatPlaceCouldNotBeFound") };
    }
    if (!res.ok) {
      logger.warn(`placeSuggestions: details answered ${res.status}`);
      return unavailable();
    }
    const json = (await res.json()) as DetailsResponse;
    const lat = json.location?.latitude;
    const lng = json.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return { status: 404, message: tr("thatPlaceCouldNotBeFound") };
    }
    return {
      status: 200,
      data: { lat, lng, address: json.formattedAddress ?? "" },
    };
  } catch (error) {
    logger.warn("placeSuggestions: details failed", error);
    return unavailable();
  }
}
