"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { forgetDeletedActingTeam } from "@/utils/teamActor";
import { requestTeamDeletionCore } from "@abonten/services/teams/teamDeletionCore";
import { signedInAt } from "@abonten/services/teams/teamMoney";
import { requestTeamDeletionSchema } from "@abonten/validation/teamSchemas";

/**
 * An Owner asks to delete the team (typing its name, after a fresh
 * sign-in). With one Owner it is deleted now; otherwise every other Owner
 * is asked. Same service as POST /api/mobile/teams/:teamId/deletion.
 */
export const requestTeamDeletion = withActionLocale(
  async function requestTeamDeletion(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(requestTeamDeletionSchema, raw);
    if (input.error) return input.error;
    const result = await requestTeamDeletionCore(
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
