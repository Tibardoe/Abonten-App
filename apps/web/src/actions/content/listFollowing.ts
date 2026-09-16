"use server";

import { requireContentUser } from "@/utils/contentAction";
import { listFollowingCore } from "@abonten/services/content/followCore";

/** Everything the caller follows. */
export async function listFollowing() {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  return listFollowingCore(caller.svc, caller.userId);
}
