"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { contentPublisherFor } from "@/utils/teamActor";
import { registerContentMediaCore } from "@abonten/services/content/contentMediaCore";
import { registerContentMediaSchema } from "@abonten/validation/contentSchemas";

/** Registers a direct Cloudinary upload as content media (server re-reads the asset). */
export const registerContentMedia = withActionLocale(
  async function registerContentMedia(input: unknown) {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    const parsed = parseContentInput(registerContentMediaSchema, input);
    if (parsed.error) return parsed.error;
    const publisher = await contentPublisherFor(caller.userId);
    return registerContentMediaCore(caller.svc, caller.userId, parsed.data, {
      publisherId: publisher.accountId,
      blocked: publisher.blocked,
    });
  },
);
