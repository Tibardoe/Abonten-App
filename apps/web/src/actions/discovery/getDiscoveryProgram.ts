"use server";

import { resolveDiscoveryCaller } from "@/utils/discoveryAction";
import { getDiscoveryProgramCore } from "@abonten/services/search/discoveryProgram";
import {
  DISABLED_DISCOVERY_PROGRAM,
  type DiscoveryProgram,
} from "@abonten/types/discoveryType";

/** What the current visitor may use. Signed-out visitors get search only when it is open to everyone. */
export async function getDiscoveryProgram(): Promise<{
  status: number;
  data: DiscoveryProgram;
}> {
  try {
    const caller = await resolveDiscoveryCaller();
    return await getDiscoveryProgramCore(caller.svc, caller.userId);
  } catch {
    return { status: 200, data: DISABLED_DISCOVERY_PROGRAM };
  }
}
