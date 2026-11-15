"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { answerTeamInviteCore } from "@abonten/services/teams/teamCore";
import { answerTeamInviteSchema } from "@abonten/validation/teamSchemas";

/** The invited person joins the team or says no. */
export const answerTeamInvite = withActionLocale(
  async function answerTeamInvite(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(answerTeamInviteSchema, raw);
    if (input.error) return input.error;
    const result = await answerTeamInviteCore(
      caller.svc,
      caller.userId,
      input.data,
    );
    if (result.status === 200) revalidateAppPath("/settings/teams");
    return result;
  },
);
