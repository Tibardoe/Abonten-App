"use server";

import { resolveFieldOpsCaller } from "@/utils/fieldOpsAction";
import { getMyFieldOpsCore } from "@abonten/services/fieldOps/member/myFieldOpsQuery";
import type { FieldOpsMe } from "@abonten/types/fieldOps";

/**
 * Whether the programme is on for the signed-in user, their memberships and
 * the campaign /field shows (today's assignments + quick stats). Same
 * service as GET /api/mobile/field-ops/me.
 */
export async function getMyFieldOps(): Promise<{
  status: number;
  message?: string;
  data?: FieldOpsMe;
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  return getMyFieldOpsCore(svc, userId);
}
