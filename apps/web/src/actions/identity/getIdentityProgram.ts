"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { resolveDiscoveryCaller } from "@/utils/discoveryAction";
import { resolveIdentityAccess } from "@abonten/services/identity/identityProgram";
import { DISABLED_IDENTITY_PROGRAM } from "@abonten/types/identityType";

/** Whether identity checks are open to the current visitor. Fails closed. */
export const getIdentityProgram = withActionLocale(
  async function getIdentityProgram() {
    const caller = await resolveDiscoveryCaller();
    try {
      const { program } = await resolveIdentityAccess(
        caller.svc,
        caller.userId,
      );
      return { status: 200, data: program };
    } catch {
      return { status: 200, data: DISABLED_IDENTITY_PROGRAM };
    }
  },
);
