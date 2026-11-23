import { logger } from "@abonten/core/logger";
import {
  type PlaceSpecialHourRow,
  SPECIAL_HOURS_MAX_UPCOMING,
  type SpecialHoursInput,
  normalizeSpecialHours,
  placeLocalDate,
  specialHoursProblem,
  specialHoursProblemMessage,
} from "@abonten/core/placeSpecialHours";
import { addCalendarDays } from "@abonten/core/time/timeZone";
import { userFacingError } from "@abonten/core/userFacingError";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coreT, tr } from "../i18n/requestLocale";

// Special dates in a place's opening hours (place_special_hours, PROJECT.md
// §90): a holiday or an event day on which the place is closed or keeps
// other hours. Written by the caller's own client, like the weekly hours
// (placeHoursStatusCore): the table's rules let the place's owner (a person,
// or a team member acting with places.manage) write and everyone read a
// published place's rows; the owner-scoped place lookup below is the
// friendly check. Post-auth bodies of the web addPlaceSpecialHours /
// removePlaceSpecialHours actions and the mobile
// /api/mobile/organizer/places/:placeId/special-hours routes. NOT "use
// server".

export type PlaceSpecialHoursRow = PlaceSpecialHourRow & { id: string };

export type PlaceSpecialHoursCoreResult =
  | { status: 200; message: string; data?: PlaceSpecialHoursRow }
  | { status: 400 | 404 | 409 | 500; message: string };

const COLUMNS = "id, special_date, open_time, close_time, is_closed, label";

async function ownedPlace(
  supabase: SupabaseClient<Database>,
  userId: string,
  placeId: string,
): Promise<{ id: string; timezone: string } | null> {
  const { data, error } = await supabase
    .from("place")
    .select("id, timezone")
    .eq("id", placeId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * A place's special dates from today (on its own calendar) on, soonest
 * first — for the owner's editor. Readable by anyone the table's select
 * rule lets in (the owner always).
 */
export async function fetchUpcomingPlaceSpecialHours(
  supabase: SupabaseClient<Database>,
  placeId: string,
  timeZone: string | null | undefined,
  now: Date = new Date(),
): Promise<{ data: PlaceSpecialHoursRow[] } | { error: string }> {
  const { data, error } = await supabase
    .from("place_special_hours")
    .select(COLUMNS)
    .eq("place_id", placeId)
    .gte("special_date", placeLocalDate(now, timeZone))
    .order("special_date", { ascending: true });
  if (error) return { error: error.message };
  return { data: data ?? [] };
}

/**
 * Adds a special date, or replaces the one already set for that date.
 * Today is allowed (an unexpected closure), a day before it is not.
 */
export async function addPlaceSpecialHoursCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  placeId: string,
  input: SpecialHoursInput,
  now: Date = new Date(),
): Promise<PlaceSpecialHoursCoreResult> {
  const place = await ownedPlace(supabase, userId, placeId);
  if (!place) {
    return { status: 404, message: tr("placeNotFoundOrUnauthorized") };
  }

  const problem = specialHoursProblem(input, now, place.timezone);
  if (problem) {
    return {
      status: 400,
      message: specialHoursProblemMessage(coreT(), problem),
    };
  }
  const row = normalizeSpecialHours(input);
  const today = placeLocalDate(now, place.timezone);

  // Past dates are never read again; yesterday's still matters for hours
  // that ran past midnight. Clearing them here keeps the table small
  // without a job.
  const { error: cleanError } = await supabase
    .from("place_special_hours")
    .delete()
    .eq("place_id", placeId)
    .lt("special_date", addCalendarDays(today, -1));
  if (cleanError) {
    logger.warn(`Could not clear past special dates: ${cleanError.message}`);
  }

  const { data: upcoming, error: countError } = await supabase
    .from("place_special_hours")
    .select("special_date")
    .eq("place_id", placeId)
    .gte("special_date", today);
  if (countError) {
    return {
      status: 500,
      message: userFacingError("Save special date", countError),
    };
  }
  const dates = new Set((upcoming ?? []).map((r) => r.special_date));
  if (
    !dates.has(row.special_date) &&
    dates.size >= SPECIAL_HOURS_MAX_UPCOMING
  ) {
    return {
      status: 409,
      message: specialHoursProblemMessage(coreT(), "too_many"),
    };
  }

  const { data, error } = await supabase
    .from("place_special_hours")
    .upsert(
      { place_id: placeId, ...row },
      { onConflict: "place_id,special_date" },
    )
    .select(COLUMNS)
    .single();

  if (error || !data) {
    return {
      status: 500,
      message: userFacingError("Save special date", error),
    };
  }

  return { status: 200, message: tr("specialDateSaved"), data };
}

export async function removePlaceSpecialHoursCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  placeId: string,
  specialHoursId: string,
): Promise<PlaceSpecialHoursCoreResult> {
  const place = await ownedPlace(supabase, userId, placeId);
  if (!place) {
    return { status: 404, message: tr("placeNotFoundOrUnauthorized") };
  }

  const { data, error } = await supabase
    .from("place_special_hours")
    .delete()
    .eq("id", specialHoursId)
    .eq("place_id", placeId)
    .select("id");

  if (error) {
    return {
      status: 500,
      message: userFacingError("Remove special date", error),
    };
  }
  if (!data || data.length === 0) {
    return { status: 404, message: tr("specialDateNotFound") };
  }

  return { status: 200, message: tr("specialDateRemoved") };
}
