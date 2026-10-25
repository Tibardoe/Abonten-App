"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseDiscoveryInput } from "@/utils/discoveryAction";
import { requireTicketPlanUser } from "@/utils/ticketPlanAction";
import { setEventTicketPlanSettingCore } from "@abonten/services/ticketPlans/eventTicketPlanCore";
import { eventTicketPlanSettingSchema } from "@abonten/validation/ticketPlanSchemas";

/** Lets buyers pay small small for this event, or stops new plans. */
export const setEventTicketPlanSetting = withActionLocale(
  async function setEventTicketPlanSetting(raw: unknown) {
    const caller = await requireTicketPlanUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(eventTicketPlanSettingSchema, raw);
    if (input.error) return input.error;
    return setEventTicketPlanSettingCore(caller.userId, input.data);
  },
);
