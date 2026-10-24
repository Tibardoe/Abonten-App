"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseIdentityInput,
  requireIdentityUser,
} from "@/utils/identityAction";
import { cancelIdentityVerificationCore } from "@abonten/services/identity/identityCore";
import { identityVerificationIdSchema } from "@abonten/validation/identitySchemas";

/** Stops a check the person has not finished. */
export const cancelIdentityVerification = withActionLocale(
  async function cancelIdentityVerification(raw: unknown) {
    const caller = await requireIdentityUser();
    if (caller.error) return caller.error;
    const input = parseIdentityInput(identityVerificationIdSchema, raw);
    if (input.error) return input.error;
    return cancelIdentityVerificationCore(
      caller.svc,
      caller.userId,
      input.data,
    );
  },
);
