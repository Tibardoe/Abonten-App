"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseDiscoveryInput } from "@/utils/discoveryAction";
import { requireTicketPlanUser } from "@/utils/ticketPlanAction";
import { getEventTicketPlanSettingCore } from "@abonten/services/ticketPlans/eventTicketPlanCore";
import { z } from "zod";

/** The organizer's Pay small small switch for one of their events. */
export const getEventTicketPlanSetting = withActionLocale(
  async function getEventTicketPlanSetting(raw: unknown) {
    const caller = await requireTicketPlanUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(
      z.object({ eventId: z.string().uuid() }),
      raw,
    );
    if (input.error) return input.error;
    return getEventTicketPlanSettingCore(caller.userId, input.data.eventId);
  },
);
