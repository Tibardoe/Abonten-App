"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { leaveAreaWaitlistCore } from "@abonten/services/markets/areaWaitlistCore";

/** Takes the signed-in person off the waiting list for this area. */
export default withActionLocale(async function leaveAreaWaitlist(input: {
  lat: number;
  lng: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: tr("userNotLoggedIn") };
  return leaveAreaWaitlistCore(user.id, input);
});
