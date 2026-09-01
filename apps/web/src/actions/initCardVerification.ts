"use server";

import { createClient } from "@/config/supabase/server";
import {
  type InitCardVerificationCoreResult,
  initCardVerificationCore,
} from "@/utils/cardVerificationCore";

/**
 * Starts a real GHS 1 Paystack charge purely to capture a reusable card
 * authorization — Paystack has no way to "tokenize" a card without an
 * actual charge. confirmCardVerification.ts refunds this amount immediately
 * after the authorization is captured. Post-auth logic lives in
 * cardVerificationCore so the mobile API route shares it.
 */
export default async function initCardVerification(): Promise<
  InitCardVerificationCoreResult | { status: 401; message: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    return { status: 401, message: "User not logged in" };
  }

  return initCardVerificationCore(user.id, user.email);
}
