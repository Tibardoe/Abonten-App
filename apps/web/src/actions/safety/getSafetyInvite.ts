"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseSafetyInput,
  resolveSafetyCaller,
  safetyRequestIp,
} from "@/utils/safetyAction";
import { getSafetyInviteCore } from "@abonten/services/safety/safetyInviteCore";
import { safetyTokenSchema } from "@abonten/validation/safetySchemas";

/** The invite page a new trusted contact opens (/trusted/<token>). */
export const getSafetyInvite = withActionLocale(async function getSafetyInvite(
  raw: unknown,
) {
  const input = parseSafetyInput(safetyTokenSchema, raw);
  if (input.error) return input.error;
  const caller = await resolveSafetyCaller();
  return getSafetyInviteCore(
    caller.svc,
    input.data.token,
    await safetyRequestIp(),
  );
});
