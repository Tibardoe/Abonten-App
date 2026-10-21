"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseSafetyInput, requireSafetyUser } from "@/utils/safetyAction";
import { safetyDeps } from "@/utils/sendSafetyEmail";
import { startSafetySessionCore } from "@abonten/services/safety/safetySessionCore";
import { startSafetySessionSchema } from "@abonten/validation/safetySchemas";

/** SOS, a check-in or a location share from the website. */
export const startSafetySession = withActionLocale(
  async function startSafetySession(raw: unknown) {
    const caller = await requireSafetyUser();
    if (caller.error) return caller.error;
    const input = parseSafetyInput(startSafetySessionSchema, raw);
    if (input.error) return input.error;
    return startSafetySessionCore(caller.svc, caller.userId, input.data, {
      createdVia: "web",
      deps: safetyDeps,
    });
  },
);
