"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { findTicketTransferRecipientCore } from "@abonten/services/ticketTransfers/ticketTransferCore";
import { ticketTransferRecipientSchema } from "@abonten/validation/ticketTransferSchemas";

/** Who a typed username or number points at, shown before sending. */
export const findTicketTransferRecipient = withActionLocale(
  async function findTicketTransferRecipient(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(ticketTransferRecipientSchema, raw);
    if (input.error) return input.error;
    return findTicketTransferRecipientCore(
      caller.svc,
      caller.userId,
      input.data.target,
    );
  },
);
