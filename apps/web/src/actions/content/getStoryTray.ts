"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { resolveContentCaller } from "@/utils/contentAction";
import { getStoryTrayCore } from "@abonten/services/content/storiesCore";

/** The Stories row for Messages. */
export const getStoryTray = withActionLocale(async function getStoryTray() {
  const caller = await resolveContentCaller();
  return getStoryTrayCore(caller.svc, caller.userId);
});
