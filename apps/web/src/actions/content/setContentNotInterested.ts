"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { setNotInterestedCore } from "@abonten/services/content/contentEngagementCore";
import { contentNotInterestedSchema } from "@abonten/validation/contentSchemas";

/** Hide a post from the viewer's feeds. */
export const setContentNotInterested = withActionLocale(
  async function setContentNotInterested(input: unknown) {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    const parsed = parseContentInput(contentNotInterestedSchema, input);
    if (parsed.error) return parsed.error;
    return setNotInterestedCore(caller.svc, caller.userId, parsed.data);
  },
);
