"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseSafetyInput,
  resolveSafetyCaller,
  safetyRequestIp,
} from "@/utils/safetyAction";
import { acknowledgeSafetyAlertCore } from "@abonten/services/safety/safetyViewCore";
import { acknowledgeSafetyAlertSchema } from "@abonten/validation/safetySchemas";

/** A contact answers: on my way, calling, or can't help right now. */
export const acknowledgeSafetyAlert = withActionLocale(
  async function acknowledgeSafetyAlert(raw: unknown) {
    const input = parseSafetyInput(acknowledgeSafetyAlertSchema, raw);
    if (input.error) return input.error;
    const caller = await resolveSafetyCaller();
    return acknowledgeSafetyAlertCore(caller.svc, input.data, {
      ip: await safetyRequestIp(),
    });
  },
);
