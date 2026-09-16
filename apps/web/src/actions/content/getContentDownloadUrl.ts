"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { getContentDownloadUrlCore } from "@abonten/services/content/contentPostCore";
import { contentPostIdSchema } from "@abonten/validation/contentSchemas";

/** A download link for a Spotlight whose owner allows downloads. */
export async function getContentDownloadUrl(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(contentPostIdSchema, input);
  if (parsed.error) return parsed.error;
  return getContentDownloadUrlCore(
    caller.svc,
    caller.userId,
    parsed.data.postId,
  );
}
