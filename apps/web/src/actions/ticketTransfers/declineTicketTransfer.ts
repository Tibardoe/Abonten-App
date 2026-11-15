"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { declineTicketTransferCore } from "@abonten/services/ticketTransfers/ticketTransferCore";
import { ticketTransferIdSchema } from "@abonten/validation/ticketTransferSchemas";

/** Says no to a ticket someone sent: it stays with them. */
export const declineTicketTransfer = withActionLocale(
  async function declineTicketTransfer(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(ticketTransferIdSchema, raw);
    if (input.error) return input.error;
    return declineTicketTransferCore(
      caller.svc,
      caller.userId,
      input.data.transferId,
    );
  },
);
