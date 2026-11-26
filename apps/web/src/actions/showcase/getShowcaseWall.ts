"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  resolveDiscoveryCaller,
} from "@/utils/discoveryAction";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";
import { getShowcaseWallCore } from "@abonten/services/showcase/showcaseWallCore";
import type { ShowcaseWall } from "@abonten/types/showcaseType";
import { showcaseWallRequestSchema } from "@abonten/validation/showcaseSchemas";

/**
 * The "On Abonten" wall for this visitor and place: data null when it is
 * not on for them or too thin to show. Read per request (the tiles carry
 * the visitor's own follow state), never cached for others.
 */
export const getShowcaseWall = withActionLocale(async function getShowcaseWall(
  input: unknown,
): Promise<{ status: number; message?: string; data?: ShowcaseWall | null }> {
  const parsed = parseDiscoveryInput(showcaseWallRequestSchema, input);
  if (parsed.error) return parsed.error;
  try {
    const caller = await resolveDiscoveryCaller();
    return await getShowcaseWallCore(caller.svc, caller.userId, parsed.data);
  } catch (error) {
    logger.error("getShowcaseWall failed", error);
    return { status: 500, message: tr("couldnTLoadOnAbonten") };
  }
});
