"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { setContentSaveCore } from "@abonten/services/content/contentEngagementCore";
import { contentSaveSchema } from "@abonten/validation/contentSchemas";

/** Save / unsave a post (idempotent). */
export async function setContentSave(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(contentSaveSchema, input);
  if (parsed.error) return parsed.error;
  return setContentSaveCore(caller.svc, caller.userId, parsed.data);
}
