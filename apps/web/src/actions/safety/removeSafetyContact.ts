"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseSafetyInput, requireSafetyUser } from "@/utils/safetyAction";
import { removeSafetyContactCore } from "@abonten/services/safety/safetyContactsCore";
import { safetyContactIdSchema } from "@abonten/validation/safetySchemas";

/** Removes a trusted contact. */
export const removeSafetyContact = withActionLocale(
  async function removeSafetyContact(raw: unknown) {
    const caller = await requireSafetyUser();
    if (caller.error) return caller.error;
    const input = parseSafetyInput(safetyContactIdSchema, raw);
    if (input.error) return input.error;
    return removeSafetyContactCore(
      caller.svc,
      caller.userId,
      input.data.contactId,
    );
  },
);
