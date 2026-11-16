"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { actingFor } from "@/utils/teamActor";
import { getEventTicketTransferSettingCore } from "@abonten/services/ticketTransfers/ticketTransferCore";
import { eventIdOnlySchema } from "@abonten/validation/ticketTransferSchemas";

/** The organizer's switch: may guests send this event's tickets on. */
export const getEventTicketTransferSetting = withActionLocale(
  async function getEventTicketTransferSetting(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(eventIdOnlySchema, raw);
    if (input.error) return input.error;
    // Managing as a team: the same rule as the app (events.manage).
    const acting = await actingFor(caller.userId, "events.manage");
    if (acting.error) return acting.error;
    return getEventTicketTransferSettingCore(
      caller.svc,
      acting.accountId,
      input.data.eventId,
    );
  },
);
