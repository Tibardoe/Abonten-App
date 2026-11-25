"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { checkUsernameAvailabilityCore } from "@abonten/services/profile/usernameAvailabilityCore";
import { usernameCheckSchema } from "@abonten/validation/usernameSchemas";

/**
 * "Is this username free?" as the person types: their own Edit profile, a
 * team's profile (Owners) or the Make-a-team form. Same service as POST
 * /api/mobile/usernames/check (rate-limited, well-formed handles only).
 */
export const checkUsernameAvailability = withActionLocale(
  async function checkUsernameAvailability(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(usernameCheckSchema, raw);
    if (input.error) return input.error;
    return checkUsernameAvailabilityCore(caller.svc, caller.userId, input.data);
  },
);
