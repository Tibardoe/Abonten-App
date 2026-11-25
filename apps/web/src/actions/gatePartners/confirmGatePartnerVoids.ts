"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { actingFor } from "@/utils/teamActor";
import { confirmGatePartnerVoidsCore } from "@abonten/services/gatePartners/organizerGateCore";
import { confirmGatePartnerVoidsSchema } from "@abonten/validation/gatePartnerSchemas";

/** The organizer voided these partner codes in their own gate system. */
export const confirmGatePartnerVoids = withActionLocale(
  async function confirmGatePartnerVoids(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(confirmGatePartnerVoidsSchema, raw);
    if (input.error) return input.error;
    // Managing as a team: the same rule as the app (events.manage).
    const acting = await actingFor(caller.userId, "events.manage");
    if (acting.error) return acting.error;
    return confirmGatePartnerVoidsCore(
      caller.svc,
      acting.accountId,
      caller.userId,
      input.data,
    );
  },
);
