"use server";

import { requireContentUser } from "@/utils/contentAction";
import { listAttachableEventsCore } from "@abonten/services/content/contentAttachCore";

/** Events the caller may attach to a Spotlight or Story. */
export async function listAttachableEvents() {
  const caller = await requireContentUser();
  if (caller.error) return caller.error;
  return listAttachableEventsCore(caller.svc, caller.userId);
}
