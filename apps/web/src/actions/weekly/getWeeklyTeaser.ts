"use server";

import {
  parseDiscoveryInput,
  resolveDiscoveryCaller,
} from "@/utils/discoveryAction";
import { getWeeklyTeaserCore } from "@abonten/services/weekly/weeklyEditionCore";
import type { WeeklyTeaser } from "@abonten/types/weeklyType";
import { weeklyTeaserRequestSchema } from "@abonten/validation/weeklySchemas";

/** The Explore teaser for this visitor and location, or null. Never throws. */
export async function getWeeklyTeaser(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: WeeklyTeaser | null;
}> {
  const parsed = parseDiscoveryInput(weeklyTeaserRequestSchema, input);
  if (parsed.error) return { ...parsed.error, data: null };
  try {
    const caller = await resolveDiscoveryCaller();
    return await getWeeklyTeaserCore(caller.svc, caller.userId, parsed.data);
  } catch {
    return { status: 200, data: null };
  }
}
