"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { resolveSafetyCaller } from "@/utils/safetyAction";
import { getSafetyProgramCore } from "@abonten/services/safety/safetyProgram";
import { DISABLED_SAFETY_PROGRAM } from "@abonten/types/safetyType";

/** What the current visitor may use of Abonten Safety. Fails closed. */
export const getSafetyProgram = withActionLocale(
  async function getSafetyProgram() {
    const caller = await resolveSafetyCaller();
    try {
      return await getSafetyProgramCore(caller.svc, caller.userId);
    } catch {
      return { status: 200, data: DISABLED_SAFETY_PROGRAM };
    }
  },
);
