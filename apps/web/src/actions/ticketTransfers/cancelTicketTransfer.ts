"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { cancelTicketTransferCore } from "@abonten/services/ticketTransfers/ticketTransferCore";
import { ticketTransferIdSchema } from "@abonten/validation/ticketTransferSchemas";

/** Takes back an offer nobody has accepted yet. */
export const cancelTicketTransfer = withActionLocale(
  async function cancelTicketTransfer(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(ticketTransferIdSchema, raw);
    if (input.error) return input.error;
    const result = await cancelTicketTransferCore(
      caller.svc,
      caller.userId,
      input.data.transferId,
    );
    if (result.status === 200) revalidateAppPath("/manage/my-events");
    return result;
  },
);
