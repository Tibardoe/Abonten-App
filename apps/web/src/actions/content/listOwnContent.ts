"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { listOwnContentPostsCore } from "@abonten/services/content/contentPostCore";
import { ownContentRequestSchema } from "@abonten/validation/contentSchemas";

/** The creator's own posts in every state. */
export const listOwnContent = withActionLocale(async function listOwnContent(
  input: unknown,
) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(ownContentRequestSchema, input);
  if (parsed.error) return parsed.error;
  return listOwnContentPostsCore(caller.svc, caller.userId, parsed.data);
});
