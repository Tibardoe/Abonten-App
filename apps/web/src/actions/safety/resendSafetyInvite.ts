"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseSafetyInput, requireSafetyUser } from "@/utils/safetyAction";
import { safetyDeps } from "@/utils/sendSafetyEmail";
import { resendSafetyInviteCore } from "@abonten/services/safety/safetyContactsCore";
import { safetyContactIdSchema } from "@abonten/validation/safetySchemas";

/** Sends a pending contact's invite again (once a day, three times in all). */
export const resendSafetyInvite = withActionLocale(
  async function resendSafetyInvite(raw: unknown) {
    const caller = await requireSafetyUser();
    if (caller.error) return caller.error;
    const input = parseSafetyInput(safetyContactIdSchema, raw);
    if (input.error) return input.error;
    return resendSafetyInviteCore(
      caller.svc,
      caller.userId,
      input.data.contactId,
      safetyDeps,
    );
  },
);
