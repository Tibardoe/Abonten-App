"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { getAreaWaitlistStatusCore } from "@abonten/services/markets/areaWaitlistCore";
import type { AreaWaitlistStatus } from "@abonten/types/marketType";

/**
 * Whether the signed-in person asked to be told when Abonten launches in
 * the area at this point. Signed out means not waiting.
 */
export default withActionLocale(async function getAreaWaitlistStatus(input: {
  lat: number;
  lng: number;
}): Promise<{ status: number; message?: string; data?: AreaWaitlistStatus }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 200, data: { waiting: false, areaName: null } };
  return getAreaWaitlistStatusCore(user.id, input);
});
