"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseSafetyInput, requireSafetyUser } from "@/utils/safetyAction";
import { safetyDeps } from "@/utils/sendSafetyEmail";
import { tellEventTeamCore } from "@abonten/services/safety/safetySessionCore";
import { safetySessionIdSchema } from "@abonten/validation/safetySchemas";

/** Tells the organizer of the event the alert is about. */
export const tellSafetyEventTeam = withActionLocale(
  async function tellSafetyEventTeam(raw: unknown) {
    const caller = await requireSafetyUser();
    if (caller.error) return caller.error;
    const input = parseSafetyInput(safetySessionIdSchema, raw);
    if (input.error) return input.error;
    return tellEventTeamCore(
      caller.svc,
      caller.userId,
      input.data.sessionId,
      safetyDeps,
    );
  },
);
