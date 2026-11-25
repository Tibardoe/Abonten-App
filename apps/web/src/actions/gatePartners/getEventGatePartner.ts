"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { actingFor } from "@/utils/teamActor";
import { getEventGatePartnerCore } from "@abonten/services/gatePartners/organizerGateCore";
import { gatePartnerEventSchema } from "@abonten/validation/gatePartnerSchemas";

/**
 * The event's gate partner link, read-only (staff set it up): which
 * partner's check-in system admits its tickets, the ticket types it maps,
 * and the codes to void there (docs/architecture/gate-partner-connectors.md).
 */
export const getEventGatePartner = withActionLocale(
  async function getEventGatePartner(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(gatePartnerEventSchema, raw);
    if (input.error) return input.error;
    // Managing as a team: the same rule as the app (events.manage).
    const acting = await actingFor(caller.userId, "events.manage");
    if (acting.error) return acting.error;
    return getEventGatePartnerCore(
      caller.svc,
      acting.accountId,
      input.data.eventId,
    );
  },
);
