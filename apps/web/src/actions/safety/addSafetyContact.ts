"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseSafetyInput, requireSafetyUser } from "@/utils/safetyAction";
import { safetyDeps } from "@/utils/sendSafetyEmail";
import { addSafetyContactCore } from "@abonten/services/safety/safetyContactsCore";
import { addSafetyContactSchema } from "@abonten/validation/safetySchemas";

/** Adds a trusted contact and sends them the invite. */
export const addSafetyContact = withActionLocale(
  async function addSafetyContact(raw: unknown) {
    const caller = await requireSafetyUser();
    if (caller.error) return caller.error;
    const input = parseSafetyInput(addSafetyContactSchema, raw);
    if (input.error) return input.error;
    return addSafetyContactCore(
      caller.svc,
      caller.userId,
      input.data,
      safetyDeps,
    );
  },
);
