"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { acceptTicketTransferCore } from "@abonten/services/ticketTransfers/ticketTransferCore";
import { ticketTransferIdSchema } from "@abonten/validation/ticketTransferSchemas";
import { revalidatePath } from "next/cache";

/** Takes a ticket someone sent: it moves here with a new code. */
export const acceptTicketTransfer = withActionLocale(
  async function acceptTicketTransfer(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(ticketTransferIdSchema, raw);
    if (input.error) return input.error;
    const result = await acceptTicketTransferCore(
      caller.svc,
      caller.userId,
      input.data.transferId,
    );
    if (result.status === 200) revalidatePath("/manage/my-events");
    return result;
  },
);
