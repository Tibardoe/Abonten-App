"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { forgetDeletedActingTeam } from "@/utils/teamActor";
import { approveTeamDeletionCore } from "@abonten/services/teams/teamDeletionCore";
import { signedInAt } from "@abonten/services/teams/teamMoney";
import { teamDeletionRequestSchema } from "@abonten/validation/teamSchemas";

/**
 * Another Owner approves deleting the team (after a fresh sign-in). The
 * last approval deletes it. Same service as POST
 * /api/mobile/teams/:teamId/deletion/:requestId/approve.
 */
export const approveTeamDeletion = withActionLocale(
  async function approveTeamDeletion(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(teamDeletionRequestSchema, raw);
    if (input.error) return input.error;
    const result = await approveTeamDeletionCore(
      caller.svc,
      caller.userId,
      input.data,
      { signedInAt: await signedInAt(await createClient()) },
    );
    if (result.status === 200) {
      if (result.data.state === "deleted") {
        await forgetDeletedActingTeam(input.data.teamId);
      }
      revalidateAppPath("/settings/teams", "layout");
    }
    return result;
  },
);
