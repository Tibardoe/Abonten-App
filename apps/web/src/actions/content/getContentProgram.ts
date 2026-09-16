"use server";

import { resolveContentCaller } from "@/utils/contentAction";
import { getContentProgramCore } from "@abonten/services/content/contentProgram";
import { DISABLED_CONTENT_PROGRAM } from "@abonten/types/contentType";

/** What the current visitor may use of Spotlight + Stories. Fails closed. */
export async function getContentProgram() {
  const caller = await resolveContentCaller();
  try {
    return await getContentProgramCore(caller.svc, caller.userId);
  } catch {
    return { status: 200, data: DISABLED_CONTENT_PROGRAM };
  }
}
