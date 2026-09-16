"use server";

import {
  contentRequestIp,
  parseContentInput,
  requireContentUser,
} from "@/utils/contentAction";
import { createContentPostCore } from "@abonten/services/content/contentPostCore";
import { createContentPostSchema } from "@abonten/validation/contentSchemas";

/** Creates (and by default publishes) a Spotlight or Story. */
export async function createContentPost(input: unknown) {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  const parsed = parseContentInput(createContentPostSchema, input);
  if (parsed.error) return parsed.error;
  return createContentPostCore(caller.svc, caller.userId, parsed.data);
}
