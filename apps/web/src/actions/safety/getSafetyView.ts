"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseSafetyInput,
  resolveSafetyCaller,
  safetyRequestIp,
} from "@/utils/safetyAction";
import { getSafetyViewCore } from "@abonten/services/safety/safetyViewCore";
import { safetyTokenSchema } from "@abonten/validation/safetySchemas";

/** The contact's live page (/sos/<token>). No account needed: the token is theirs. */
export const getSafetyView = withActionLocale(async function getSafetyView(
  raw: unknown,
) {
  const input = parseSafetyInput(safetyTokenSchema, raw);
  if (input.error) return input.error;
  const caller = await resolveSafetyCaller();
  return getSafetyViewCore(caller.svc, input.data.token, {
    ip: await safetyRequestIp(),
  });
});
