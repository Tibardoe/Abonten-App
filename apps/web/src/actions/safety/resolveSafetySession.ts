"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseSafetyInput, requireSafetyUser } from "@/utils/safetyAction";
import { safetyDeps } from "@/utils/sendSafetyEmail";
import { resolveSafetySessionCore } from "@abonten/services/safety/safetySessionCore";
import { resolveSafetySessionSchema } from "@abonten/validation/safetySchemas";

/** "I'm safe", "That was a mistake" or "Stop sharing". */
export const resolveSafetySession = withActionLocale(
  async function resolveSafetySession(raw: unknown) {
    const caller = await requireSafetyUser();
    if (caller.error) return caller.error;
    const input = parseSafetyInput(resolveSafetySessionSchema, raw);
    if (input.error) return input.error;
    return resolveSafetySessionCore(
      caller.svc,
      caller.userId,
      input.data,
      safetyDeps,
    );
  },
);
