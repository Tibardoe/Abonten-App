"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseSafetyInput, requireSafetyUser } from "@/utils/safetyAction";
import { updateSafetyContactCore } from "@abonten/services/safety/safetyContactsCore";
import { updateSafetyContactSchema } from "@abonten/validation/safetySchemas";

/** Renames a contact, changes their language or email, or puts them first. */
export const updateSafetyContact = withActionLocale(
  async function updateSafetyContact(raw: unknown) {
    const caller = await requireSafetyUser();
    if (caller.error) return caller.error;
    const input = parseSafetyInput(updateSafetyContactSchema, raw);
    if (input.error) return input.error;
    return updateSafetyContactCore(caller.svc, caller.userId, input.data);
  },
);
