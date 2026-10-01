"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { resolveDiscoveryCaller } from "@/utils/discoveryAction";
import { getWeeklyProgramCore } from "@abonten/services/weekly/weeklyProgram";
import {
  DISABLED_WEEKLY_PROGRAM,
  type WeeklyProgram,
} from "@abonten/types/weeklyType";

/** Whether the current visitor may see Abonten Weekly. Fails closed. */
export const getWeeklyProgram = withActionLocale(
  async function getWeeklyProgram(): Promise<{
    status: number;
    data: WeeklyProgram;
  }> {
    try {
      const caller = await resolveDiscoveryCaller();
      return await getWeeklyProgramCore(caller.svc, caller.userId);
    } catch {
      return { status: 200, data: DISABLED_WEEKLY_PROGRAM };
    }
  },
);
