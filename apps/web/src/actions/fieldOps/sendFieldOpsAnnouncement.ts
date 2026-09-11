"use server";

import {
  parseFieldOpsInput,
  resolveFieldOpsCaller,
} from "@/utils/fieldOpsAction";
import { sendAnnouncementCore } from "@abonten/services/fieldOps/lead/announceCore";
import { fieldOpsAnnouncementSchema } from "@abonten/validation/fieldOpsSchemas";

/**
 * A team lead's announcement to every active member. Same service as
 * POST /api/mobile/field-ops/lead/announce.
 */
export async function sendFieldOpsAnnouncement(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: { recipients: number };
}> {
  const caller = await resolveFieldOpsCaller();
  if (caller.error) return caller.error;
  const { userId, svc } = caller;
  const parsed = parseFieldOpsInput(fieldOpsAnnouncementSchema, input);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  return sendAnnouncementCore(svc, userId, data);
}
