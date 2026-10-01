"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { registerContentMediaCore } from "@abonten/services/content/contentMediaCore";
import { registerContentMediaSchema } from "@abonten/validation/contentSchemas";

/** Registers a direct Cloudinary upload as content media (server re-reads the asset). */
export const registerContentMedia = withActionLocale(
  async function registerContentMedia(input: unknown) {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    const parsed = parseContentInput(registerContentMediaSchema, input);
    if (parsed.error) return parsed.error;
    return registerContentMediaCore(caller.svc, caller.userId, parsed.data);
  },
);
