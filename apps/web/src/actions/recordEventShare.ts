"use server";

import { createClient } from "@/config/supabase/server";
import { recordEventShareCore } from "@abonten/services/rewards/referralCore";

/** A signed-in user pressed Share on an event (analytics only). */
export async function recordEventShare(input: {
  eventId: string;
  channel: "native" | "copy";
  referralCode: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401 };

  return recordEventShareCore(supabase, user.id, input);
}
