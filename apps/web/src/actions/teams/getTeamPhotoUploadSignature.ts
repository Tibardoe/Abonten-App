"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import {
  parseDiscoveryInput,
  requireDiscoveryUser,
} from "@/utils/discoveryAction";
import { teamPhotoUploadSignatureCore } from "@abonten/services/teams/teamProfileCore";
import { teamIdSchema } from "@abonten/validation/teamSchemas";

/**
 * A signature to upload the team's photo straight to Cloudinary, into the
 * team's own folder, for an Owner. Same service as POST
 * /api/mobile/teams/:teamId/photo/signature.
 */
export const getTeamPhotoUploadSignature = withActionLocale(
  async function getTeamPhotoUploadSignature(raw: unknown) {
    const caller = await requireDiscoveryUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(teamIdSchema, raw);
    if (input.error) return input.error;
    return teamPhotoUploadSignatureCore(
      caller.svc,
      caller.userId,
      input.data.teamId,
    );
  },
);
