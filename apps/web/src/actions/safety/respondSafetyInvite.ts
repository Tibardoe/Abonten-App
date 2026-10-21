"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseSafetyInput,
  resolveSafetyCaller,
  safetyRequestIp,
} from "@/utils/safetyAction";
import { respondSafetyInviteCore } from "@abonten/services/safety/safetyInviteCore";
import { respondSafetyInviteSchema } from "@abonten/validation/safetySchemas";

/**
 * A new trusted contact accepts, declines, or stops all Abonten Safety
 * texts to their number. Accepting while signed in links their account.
 */
export const respondSafetyInvite = withActionLocale(
  async function respondSafetyInvite(raw: unknown) {
    const input = parseSafetyInput(respondSafetyInviteSchema, raw);
    if (input.error) return input.error;
    const caller = await resolveSafetyCaller();
    return respondSafetyInviteCore(
      caller.svc,
      input.data.token,
      input.data.response,
      {
        userId: caller.userId,
        ip: await safetyRequestIp(),
      },
    );
  },
);
