"use server";

import {
  contentRequestIp,
  parseContentInput,
  resolveContentCaller,
} from "@/utils/contentAction";
import { recordContentClickCore } from "@abonten/services/content/contentTelemetryCore";
import { contentClickSchema } from "@abonten/validation/contentSchemas";

/** A click on a post's profile / event / place / ticket call to action. */
export async function recordContentClick(input: unknown) {
  const caller = await resolveContentCaller();
  const parsed = parseContentInput(contentClickSchema, input);
  if (parsed.error) return parsed.error;
  return recordContentClickCore(caller.svc, caller.userId, parsed.data, {
    ip: await contentRequestIp(),
  });
}
