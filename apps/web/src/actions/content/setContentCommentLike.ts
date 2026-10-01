"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { setContentCommentLikeCore } from "@abonten/services/content/contentEngagementCore";
import { contentCommentLikeSchema } from "@abonten/validation/contentSchemas";

/** Like / unlike a comment. */
export const setContentCommentLike = withActionLocale(
  async function setContentCommentLike(input: unknown) {
    const caller = await requireContentUser();
    if (caller.error) return caller.error;
    const parsed = parseContentInput(contentCommentLikeSchema, input);
    if (parsed.error) return parsed.error;
    return setContentCommentLikeCore(caller.svc, caller.userId, parsed.data);
  },
);
