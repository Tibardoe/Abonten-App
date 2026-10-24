"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseIdentityInput,
  requireIdentityUser,
} from "@/utils/identityAction";
import { startIdentityVerificationCore } from "@abonten/services/identity/identityCore";
import { startIdentityVerificationSchema } from "@abonten/validation/identitySchemas";

/** Starts a check: returns the provider's page to send the person to. */
export const startIdentityVerification = withActionLocale(
  async function startIdentityVerification(raw: unknown) {
    const caller = await requireIdentityUser();
    if (caller.error) return caller.error;
    const input = parseIdentityInput(startIdentityVerificationSchema, raw);
    if (input.error) return input.error;
    return startIdentityVerificationCore(caller.svc, caller.userId, input.data);
  },
);
