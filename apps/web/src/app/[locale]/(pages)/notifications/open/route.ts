import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import { markNotificationReadFor } from "@abonten/services/notifications/notificationsQuery";
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
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const target = safePath(url.searchParams.get("to"), url.origin);

  if (UUID.test(id)) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) await markNotificationReadFor(supabase, user.id, id);
    } catch (e) {
      logger.error("notifications/open: mark read failed", e);
    }
  }

  return NextResponse.redirect(new URL(target, url.origin), 303);
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
