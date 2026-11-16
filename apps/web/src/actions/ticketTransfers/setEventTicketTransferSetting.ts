"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { actingFor } from "@/utils/teamActor";
import { setEventTicketTransferSettingCore } from "@abonten/services/ticketTransfers/ticketTransferCore";
import { eventTicketTransferSettingSchema } from "@abonten/validation/ticketTransferSchemas";

/** Lets or stops guests sending this event's tickets to friends. */
export const setEventTicketTransferSetting = withActionLocale(
  async function setEventTicketTransferSetting(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(eventTicketTransferSettingSchema, raw);
    if (input.error) return input.error;
    // Managing as a team: the same rule as the app (events.manage).
    const acting = await actingFor(caller.userId, "events.manage");
    if (acting.error) return acting.error;
    return setEventTicketTransferSettingCore(
      caller.svc,
      acting.accountId,
      input.data.eventId,
      input.data.enabled,
    );
  },
);
