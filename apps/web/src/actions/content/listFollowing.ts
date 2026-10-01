"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { requireContentUser } from "@/utils/contentAction";
import { listFollowingCore } from "@abonten/services/content/followCore";

/** Everything the caller follows. */
export const listFollowing = withActionLocale(async function listFollowing() {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  return listFollowingCore(caller.svc, caller.userId);
});
