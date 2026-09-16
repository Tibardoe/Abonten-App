"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { listSavedContentCore } from "@abonten/services/content/contentFeedCore";
import { cursorRequestSchema } from "@abonten/validation/contentSchemas";

/** The viewer's saved Spotlights. */
export async function listSavedContent(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(cursorRequestSchema, input);
  if (parsed.error) return parsed.error;
  return listSavedContentCore(caller.svc, caller.userId, parsed.data.cursor);
}
