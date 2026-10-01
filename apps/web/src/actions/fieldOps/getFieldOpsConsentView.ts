"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { getConsentViewCore } from "@abonten/services/fieldOps/member/ownerOtpCore";
import { tr } from "@abonten/services/i18n/requestLocale";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import type { FieldOpsConsentView } from "@abonten/types/fieldOps";

/**
 * What the public consent page shows the business owner. Authorised by the
 * signed token in the link, not by a session (the owner usually has no
 * Abonten account yet).
 */
export const getFieldOpsConsentView = withActionLocale(
  async function getFieldOpsConsentView(token: string): Promise<{
    status: number;
    message?: string;
    data?: FieldOpsConsentView;
  }> {
    if (typeof token !== "string" || token.length < 20 || token.length > 600) {
      return { status: 404, message: tr("thisLinkIsnTValid") };
    }
    return getConsentViewCore(getSupabaseServiceClient(), token);
  },
);
