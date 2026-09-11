"use server";

import { getConsentViewCore } from "@abonten/services/fieldOps/member/ownerOtpCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import type { FieldOpsConsentView } from "@abonten/types/fieldOps";

/**
 * What the public consent page shows the business owner. Authorised by the
 * signed token in the link, not by a session (the owner usually has no
 * Abonten account yet).
 */
export async function getFieldOpsConsentView(token: string): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsConsentView;
}> {
  if (typeof token !== "string" || token.length < 20 || token.length > 600) {
    return { status: 404, message: "This link isn't valid." };
  }
  return getConsentViewCore(getSupabaseServiceClient(), token);
}
