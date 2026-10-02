"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  resolveContentCaller,
} from "@/utils/contentAction";
import { ingestContentViewsCore } from "@abonten/services/content/contentTelemetryCore";
import { contentViewBatchSchema } from "@abonten/validation/contentSchemas";

/** Batched view telemetry (validated in the database). */
export const ingestContentViews = withActionLocale(
  async function ingestContentViews(input: unknown) {
    const caller = await resolveContentCaller();
    const parsed = parseContentInput(contentViewBatchSchema, input);
    if (parsed.error) return parsed.error;
    return ingestContentViewsCore(caller.svc, caller.userId, parsed.data, {
      ip: await contentRequestIp(),
    });
  },
);
