"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { updateContentPostCore } from "@abonten/services/content/contentPostCore";
import { updateContentPostSchema } from "@abonten/validation/contentSchemas";

/** Edits caption, hashtags, attachments (drafts) and switches of an own post. */
export async function updateContentPost(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(updateContentPostSchema, input);
  if (parsed.error) return parsed.error;
  return updateContentPostCore(caller.svc, caller.userId, parsed.data);
}
