"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseIdentityInput } from "@/utils/identityAction";
import { completeTestIdentityCore } from "@abonten/services/identity/identityCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { completeTestIdentitySchema } from "@abonten/validation/identitySchemas";

/**
 * The stand-in provider's verdict picker. No sign-in, like a real
 * provider's page: the link is the key. The core refuses it on the
 * production deployment and on the production database, and for any
 * attempt not made with the stand-in.
 */
export const completeTestIdentity = withActionLocale(
  async function completeTestIdentity(raw: unknown) {
    const input = parseIdentityInput(completeTestIdentitySchema, raw);
    if (input.error) return input.error;
    return completeTestIdentityCore(getSupabaseServiceClient(), input.data);
  },
);
