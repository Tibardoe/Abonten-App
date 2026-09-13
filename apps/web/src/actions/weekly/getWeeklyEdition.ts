"use server";

import {
  parseDiscoveryInput,
  resolveDiscoveryCaller,
} from "@/utils/discoveryAction";
import { logger } from "@abonten/core/logger";
import {
  type WeeklyEditionResponse,
  getWeeklyEditionCore,
} from "@abonten/services/weekly/weeklyEditionCore";
import { weeklyEditionRequestSchema } from "@abonten/validation/weeklySchemas";

/**
 * Abonten Weekly for the signed-in visitor (staff and beta testers while the
 * programme is not open to everyone). The cached public pages call the
 * service directly instead; this is the session-aware path.
 */
export async function getWeeklyEdition(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: WeeklyEditionResponse;
}> {
  const parsed = parseDiscoveryInput(weeklyEditionRequestSchema, input);
  if (parsed.error) return parsed.error;
  try {
    const caller = await resolveDiscoveryCaller();
    return await getWeeklyEditionCore(caller.svc, caller.userId, parsed.data);
  } catch (error) {
    logger.error("getWeeklyEdition failed", error);
    return { status: 500, message: "Couldn't load Abonten Weekly." };
  }
}
