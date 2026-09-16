"use server";

import { resolveContentCaller } from "@/utils/contentAction";
import { getStoryTrayCore } from "@abonten/services/content/storiesCore";

/** The Stories row for Messages. */
export async function getStoryTray() {
  const caller = await resolveContentCaller();
  return getStoryTrayCore(caller.svc, caller.userId);
}
