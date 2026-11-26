"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requestIp,
  resolveDiscoveryCaller,
} from "@/utils/discoveryAction";
import { logger } from "@abonten/core/logger";
import { recordShowcaseTapCore } from "@abonten/services/showcase/showcaseWallCore";
import { showcaseTapSchema } from "@abonten/validation/showcaseSchemas";

/** Count a tap on an "On Abonten" tile. Counting never gets in the way. */
export const recordShowcaseTap = withActionLocale(
  async function recordShowcaseTap(input: unknown): Promise<{
    status: number;
    message?: string;
    data?: { counted: boolean };
  }> {
    const parsed = parseDiscoveryInput(showcaseTapSchema, input);
    if (parsed.error) return parsed.error;
    try {
      const caller = await resolveDiscoveryCaller();
      return await recordShowcaseTapCore(
        caller.svc,
        caller.userId,
        parsed.data,
        { ip: await requestIp() },
      );
    } catch (error) {
      logger.error("recordShowcaseTap failed", error);
      return { status: 200, data: { counted: false } };
    }
  },
);
