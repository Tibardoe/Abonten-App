"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type InitCardVerificationCoreResult,
  initCardVerificationCore,
} from "@abonten/services/payments/cardVerificationCore";

/**
 * Starts a real GHS 1 Paystack charge purely to capture a reusable card
 * authorization — Paystack has no way to "tokenize" a card without an
 * actual charge. confirmCardVerification.ts refunds this amount immediately
 * after the authorization is captured. Post-auth logic lives in
 * cardVerificationCore so the mobile API route shares it.
 */
export default withActionLocale(async function initCardVerification(): Promise<
  InitCardVerificationCoreResult | { status: 401; message: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  return initCardVerificationCore(
    supabase,
    user.id,
    user.email,
    `${process.env.NEXT_PUBLIC_BASE_URL}/wallet`,
  );
});
