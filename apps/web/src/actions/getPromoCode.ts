"use server";

import { createClient } from "@/config/supabase/server";
import {
  type GetPromoCodeCoreResult,
  getPromoCodeCore,
} from "@/utils/getPromoCodeCore";

export default async function getPromoCode(
  code: string,
  eventId: string,
): Promise<GetPromoCodeCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  return getPromoCodeCore(supabase, user.id, code, eventId);
}
