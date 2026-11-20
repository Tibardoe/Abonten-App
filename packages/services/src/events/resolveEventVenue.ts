// Another venue for an event: a new show of a tour (eventShowsCore) or an
// event that moves (eventRescheduleCore). A listed Abonten place, or an
// address whose point resolves (server-side, never from the client) to the
// listing's country: its currency, market and payment provider stay the
// same. The answer carries the venue's time zone, which reads wall-clock
// times, and the arguments event_add_show / event_reschedule take.

import { readStructuredAddress } from "@abonten/core/geo/address";
import { logger } from "@abonten/core/logger";
import { userFacingError } from "@abonten/core/userFacingError";
import { validateLocationInput } from "@abonten/core/validateLocationInput";
import type { Json } from "@abonten/types/database.types";
import { resolveListingLocation } from "../geo/locationResolution";
import { coreT, tr } from "../i18n/requestLocale";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

/** An Abonten place, or an address with its point. */
export type EventVenueInput = {
  placeId?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type EventVenueArgs = {
  p_place_id?: string;
  p_latitude?: number;
  p_longitude?: number;
  p_address?: Json;
  p_country_code?: string;
  p_timezone?: string;
};

export type ResolvedEventVenue =
  | { ok: true; timeZone: string; args: EventVenueArgs }
  | { ok: false; status: 400 | 409 | 500; message: string };

/**
 * Checks the venue against the listing's country. `otherCountryMessage` is
 * what the person reads when it is abroad (a show: "a show must be in the
 * same country"; a move: "an event can't move to another country").
 */
export async function resolveEventVenue(
  venue: EventVenueInput,
  listingCountry: string,
  otherCountryMessage: string,
): Promise<ResolvedEventVenue> {
  if (venue.placeId) {
    const { data: place, error } = await getSupabaseServiceClient()
      .from("place")
      .select("id, status, moderation_state, country_code, timezone")
      .eq("id", venue.placeId)
      .maybeSingle();
    if (error) {
      logger.error(`event venue: place read failed (${error.message})`);
      return { ok: false, status: 500, message: tr("somethingWentWrong") };
    }
    if (
      !place ||
      place.status !== "published" ||
      place.moderation_state === "hidden" ||
      place.moderation_state === "removed"
    ) {
      return { ok: false, status: 409, message: tr("thatPlaceCanTHostAShow") };
    }
    if (place.country_code !== listingCountry) {
      return { ok: false, status: 409, message: otherCountryMessage };
    }
    return {
      ok: true,
      timeZone: place.timezone ?? "",
      args: { p_place_id: place.id },
    };
  }

  const address = venue.address?.trim() ?? "";
  const locationCheck = validateLocationInput(coreT(), {
    address,
    latitude: venue.latitude ?? Number.NaN,
    longitude: venue.longitude ?? Number.NaN,
  });
  if (!locationCheck.valid) {
    return {
      ok: false,
      status: 400,
      message: userFacingError("Event venue", locationCheck),
    };
  }
  const lat = venue.latitude as number;
  const lng = venue.longitude as number;
  const resolved = await resolveListingLocation({
    lat,
    lng,
    countryHint: listingCountry,
  });
  if (!resolved.ok) {
    return {
      ok: false,
      status: 400,
      message: userFacingError("Event venue", resolved),
    };
  }
  if (resolved.location.countryCode !== listingCountry) {
    return { ok: false, status: 409, message: otherCountryMessage };
  }
  return {
    ok: true,
    timeZone: resolved.location.timeZone,
    args: {
      p_latitude: lat,
      p_longitude: lng,
      p_address: {
        ...readStructuredAddress(null),
        full_address: address,
        country_code: resolved.location.countryCode,
      },
      p_country_code: resolved.location.countryCode,
      p_timezone: resolved.location.timeZone,
    },
  };
}
