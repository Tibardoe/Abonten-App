"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { requireDiscoveryUser } from "@/utils/discoveryAction";
import {
  getTicketTransferProgramCore,
  listIncomingTicketTransfersCore,
  listOutgoingTicketTransfersCore,
} from "@abonten/services/ticketTransfers/ticketTransferCore";

/**
 * The tickets page's offers: what others sent to the person (to accept or
 * decline), what they sent that is still waiting, and whether they may send.
 */
export const getTicketTransfers = withActionLocale(
  async function getTicketTransfers() {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const [incoming, outgoing, program] = await Promise.all([
      listIncomingTicketTransfersCore(caller.svc, caller.userId),
      listOutgoingTicketTransfersCore(caller.svc, caller.userId),
      getTicketTransferProgramCore(caller.svc, caller.userId),
    ]);
    if (incoming.status !== 200) return incoming;
    if (outgoing.status !== 200) return outgoing;
    return {
      status: 200 as const,
      data: {
        incoming: incoming.data,
        outgoing: outgoing.data,
        program: program.data,
      },
    };
  },
);
