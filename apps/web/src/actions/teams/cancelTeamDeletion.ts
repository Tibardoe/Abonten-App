"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { cancelTeamDeletionCore } from "@abonten/services/teams/teamDeletionCore";
import { teamDeletionRequestSchema } from "@abonten/validation/teamSchemas";

/**
 * Any Owner stops a request to delete the team. Same service as DELETE
 * /api/mobile/teams/:teamId/deletion/:requestId.
 */
export const cancelTeamDeletion = withActionLocale(
  async function cancelTeamDeletion(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(teamDeletionRequestSchema, raw);
    if (input.error) return input.error;
    const result = await cancelTeamDeletionCore(
      caller.svc,
      caller.userId,
      input.data,
    );
    if (result.status === 200) {
      revalidateAppPath(`/settings/teams/${input.data.teamId}`);
    }
    return result;
  },
);
