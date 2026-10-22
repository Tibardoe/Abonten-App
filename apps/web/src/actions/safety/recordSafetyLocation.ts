"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseSafetyInput, requireSafetyUser } from "@/utils/safetyAction";
import { recordSafetyLocationCore } from "@abonten/services/safety/safetySessionCore";
import { recordSafetyLocationSchema } from "@abonten/validation/safetySchemas";

/** Positions from the browser while a session is open. */
export const recordSafetyLocation = withActionLocale(
  async function recordSafetyLocation(raw: unknown) {
    const caller = await requireSafetyUser();
    if (caller.error) return caller.error;
    const input = parseSafetyInput(recordSafetyLocationSchema, raw);
    if (input.error) return input.error;
    return recordSafetyLocationCore(caller.svc, caller.userId, input.data);
  },
);
