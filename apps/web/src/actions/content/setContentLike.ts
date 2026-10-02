"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { setContentLikeCore } from "@abonten/services/content/contentEngagementCore";
import { contentLikeSchema } from "@abonten/validation/contentSchemas";

/** Like / unlike a post (idempotent). */
export const setContentLike = withActionLocale(async function setContentLike(
  input: unknown,
) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(contentLikeSchema, input);
  if (parsed.error) return parsed.error;
  return setContentLikeCore(caller.svc, caller.userId, parsed.data);
});
