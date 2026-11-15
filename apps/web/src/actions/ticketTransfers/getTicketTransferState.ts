"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { getTicketTransferStateCore } from "@abonten/services/ticketTransfers/ticketTransferCore";
import { ticketIdSchema } from "@abonten/validation/ticketTransferSchemas";

/** Whether this ticket can be sent, and the offer waiting on it. */
export const getTicketTransferState = withActionLocale(
  async function getTicketTransferState(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(ticketIdSchema, raw);
    if (input.error) return input.error;
    return getTicketTransferStateCore(
      caller.svc,
      caller.userId,
      input.data.ticketId,
    );
  },
);
