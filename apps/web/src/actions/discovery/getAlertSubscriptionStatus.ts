"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  resolveDiscoveryCaller,
} from "@/utils/discoveryAction";
import { getSubscriptionStatusCore } from "@abonten/services/notifications/subscriptionCore";
import { subscriptionStatusSchema } from "@abonten/validation/discoverySchemas";

/** Bell state for an organizer or place page. Signed out means not subscribed. */
export const getAlertSubscriptionStatus = withActionLocale(
  async function getAlertSubscriptionStatus(input: unknown) {
    const parsed = parseDiscoveryInput(subscriptionStatusSchema, input);
    if (parsed.error) return parsed.error;
    const caller = await resolveDiscoveryCaller();
    if (!caller.userId) {
      return {
        status: 200 as const,
        data: { subscribed: false, subscriptionId: null },
      };
    }
    return getSubscriptionStatusCore(
      caller.svc,
      caller.userId,
      parsed.data.kind,
      parsed.data.targetId,
    );
  },
);
