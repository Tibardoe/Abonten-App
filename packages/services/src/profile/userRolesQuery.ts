import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";

// Whether a person organises events, holds tickets or owns a place: the
// three facts the site's navigation asks on every page ("Dashboard",
// "Places"). Each is an existence check, so each reads one row at most.
// (Until 2026-10-02 the event check fetched every event the person had
// organised and every ticket they had ever held, to look at the count.)

export type UserEventRoleResult =
  | { status: 200; role: ("organizer" | "attendee")[] | "none" }
  | { status: 500; message: string };

export async function userEventRoleQuery(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<UserEventRoleResult> {
  const [organised, attended] = await Promise.all([
    supabase.from("event").select("id").eq("organizer_id", userId).limit(1),
    supabase.from("ticket").select("id").eq("user_id", userId).limit(1),
  ]);
  if (organised.error || attended.error) {
    logger.error(
      `userEventRoleQuery: ${(organised.error ?? attended.error)?.message}`,
    );
    return { status: 500, message: tr("somethingWentWrong") };
  }
  const roles: ("organizer" | "attendee")[] = [];
  if (organised.data.length > 0) roles.push("organizer");
  if (attended.data.length > 0) roles.push("attendee");
  return { status: 200, role: roles.length > 0 ? roles : "none" };
}

export type UserPlaceRoleResult =
  | { status: 200; role: "owner" | "none" }
  | { status: 500; message: string };

export async function userPlaceRoleQuery(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<UserPlaceRoleResult> {
  const { data, error } = await supabase
    .from("place")
    .select("id")
    .eq("owner_id", userId)
    .limit(1);
  if (error) {
    logger.error(`userPlaceRoleQuery: ${error.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  return { status: 200, role: data.length > 0 ? "owner" : "none" };
}
