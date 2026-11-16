import { createClient } from "@/config/supabase/server";
import { ACTING_TEAM_COOKIE } from "@/utils/teamActor";
import { logger } from "@abonten/core/logger";
import { markNotificationReadFor } from "@abonten/services/notifications/notificationsQuery";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { listActingTeams } from "@abonten/services/teams/actingAccount";
import { NextResponse } from "next/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /notifications/open?id=<notification id>&to=<site path>
//
// Where a browser push click and every link in a recommendation email land:
// marks the notification read for the signed-in owner (for a recommendation
// digest that is also "opened", which the digest caps rely on), then
// redirects to the page. Signed out, or someone else's notification: just
// redirects -- the id alone changes nothing. `to` must be a path on this
// site, so the link can't be used to send people elsewhere.
//
// A copy of a team's notice (data.team_id: a reward email, a push about the
// team) also switches "Managing as" to that team, when the person still is
// one of its members, so the page opens the team's account, not their own.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const target = safePath(url.searchParams.get("to"), url.origin);
  let teamId: string | null = null;

  if (UUID.test(id)) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await markNotificationReadFor(supabase, user.id, id);
        const { data: row } = await supabase
          .from("notification")
          .select("data")
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle();
        const team = (row?.data as { team_id?: unknown } | null)?.team_id;
        if (typeof team === "string" && UUID.test(team)) {
          const teams = await listActingTeams(
            getSupabaseServiceClient(),
            user.id,
          );
          if (teams.some((t) => t.id === team)) teamId = team;
        }
      }
    } catch (e) {
      logger.error("notifications/open: mark read failed", e);
    }
  }

  const res = NextResponse.redirect(new URL(target, url.origin), 303);
  if (teamId) {
    // The same cookie "Managing as" sets (setActingTeam); it only selects.
    res.cookies.set(ACTING_TEAM_COOKIE, teamId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}

function safePath(raw: string | null, origin: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  try {
    const resolved = new URL(raw, origin);
    if (resolved.origin !== origin) return "/";
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/";
  }
}
