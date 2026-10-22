"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseSafetyInput, requireSafetyUser } from "@/utils/safetyAction";
import { updateSafetySessionCore } from "@abonten/services/safety/safetySessionCore";
import { updateSafetySessionSchema } from "@abonten/validation/safetySchemas";

/** A note for the contacts, or more time on a check-in. */
export const updateSafetySession = withActionLocale(
  async function updateSafetySession(raw: unknown) {
    const caller = await requireSafetyUser();
    if (caller.error) return caller.error;
    const input = parseSafetyInput(updateSafetySessionSchema, raw);
    if (input.error) return input.error;
    return updateSafetySessionCore(caller.svc, caller.userId, input.data);
  },
);
