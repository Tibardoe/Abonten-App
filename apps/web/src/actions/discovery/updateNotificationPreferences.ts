"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { updateNotificationPreferencesCore } from "@abonten/services/notifications/preferencesCore";
import { notificationPreferencesPatchSchema } from "@abonten/validation/discoverySchemas";

/** Change optional notification switches or pause alerts. Transactional notices cannot be turned off. */
export const updateNotificationPreferences = withActionLocale(
  async function updateNotificationPreferences(input: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const parsed = parseDiscoveryInput(
      notificationPreferencesPatchSchema,
      input,
    );
    if (parsed.error) return parsed.error;
    return updateNotificationPreferencesCore(
      caller.svc,
      caller.userId,
      parsed.data,
    );
  },
);
