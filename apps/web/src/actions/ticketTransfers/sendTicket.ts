"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { canTextNumber } from "@abonten/services/safety/safetyPeople";
import { sendTicketCore } from "@abonten/services/ticketTransfers/ticketTransferCore";
import { sendTicketSchema } from "@abonten/validation/ticketTransferSchemas";

/** Offers one of the person's tickets to an account or a phone number. */
export const sendTicket = withActionLocale(async function sendTicket(
  raw: unknown,
) {
  const caller = await requireDiscoveryUser();
  if (caller.error) return caller.error;
  const input = parseDiscoveryInput(sendTicketSchema, raw);
  if (input.error) return input.error;
  const result = await sendTicketCore(caller.svc, caller.userId, input.data, {
    canTextNumber,
  });
  if (result.status === 200) revalidateAppPath("/manage/my-events");
  return result;
});
