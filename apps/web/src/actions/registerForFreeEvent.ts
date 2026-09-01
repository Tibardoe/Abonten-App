"use server";

import { createClient } from "@/config/supabase/server";
import { registerForFreeEventCore } from "@/utils/registerForFreeEventCore";
import { revalidatePath } from "next/cache";

/**
 * One-click RSVP for events that only offer a free "FREE" ticket type — no
 * checkout session needed since there's no price/promo/payment involved.
 * Quantity is always exactly 1 and is never taken from the client. Post-auth
 * logic lives in registerForFreeEventCore so the mobile API route shares it.
 */
export default async function registerForFreeEvent(
  eventId: string,
  occurrenceId?: string | null,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const result = await registerForFreeEventCore(
    supabase,
    user.id,
    eventId,
    occurrenceId,
  );

  if (result.status === 200) {
    revalidatePath("/manage/my-events");
    revalidatePath(`/manage/events/${eventId}`);
    revalidatePath("/manage/dashboard");
    // See generateTicket.ts for why the public event page also needs this.
    if (result.eventCode) {
      revalidatePath(`/events/${result.eventCode.toLowerCase()}`);
    }
  }

  return { status: result.status, message: result.message };
}
