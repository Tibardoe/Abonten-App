import { logger } from "@abonten/core/logger";
import { normalizeListerSocialLinks } from "@abonten/core/social/listerSocialLinks";
import { teamRoleCan } from "@abonten/core/teams/roles";
import { WEBSITE_URL_REGEX } from "@abonten/core/urlValidation";
import {
  normalizeUsernameInput,
  usernameProblem,
} from "@abonten/core/usernames/usernames";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { TeamProfilePatch, TeamRoleCode } from "@abonten/types/teamType";
import { tr } from "../i18n/requestLocale";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";
import {
  type UploadSignatureResult,
  buildCloudinaryUploadSignature,
} from "../uploads/cloudinaryUploadSignature";
import { type TeamFail, activeMembership, failFromDb } from "./teamCore";
import { isTeamsKillSwitchOn } from "./teamProgram";

// The team's public profile (docs/architecture/team-accounts.md §4n):
// Owners (team.profile) change its username, photo, bio, website and
// social links, on the website and in the app. The name keeps its own
// path (renameTeamCore: a Verified team's new name goes back to review).
// Everything is written by public.team_update_profile (service role),
// which checks the Owner again under the team's row lock and records the
// change in the team's activity; this layer checks the shapes first so the
// words are right, and issues the photo upload signature for the team's
// own folder (user_profiles/<team>/).

type Fail = TeamFail & { data?: { invalidSocialLinks?: string[] } };
type Ok<T> = { status: 200; message?: string; data: T };

const BIO_MAX = 160;

/**
 * The person may change the team's profile: an active Owner of the active
 * team, their own account in good standing, and teams not switched off in
 * an emergency (TEAMS_KILL_SWITCH).
 */
async function requireProfileOwner(
  svc: ServiceRoleClient,
  userId: string,
  teamId: string,
): Promise<Fail | null> {
  if (isTeamsKillSwitchOn()) {
    return { status: 403, message: tr("teamsUnavailable") };
  }
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const me = await activeMembership(svc, teamId, userId);
  if (!me) return { status: 404, message: tr("teamNotFound") };
  if (!teamRoleCan(me.role as TeamRoleCode, "team.profile")) {
    return { status: 403, message: tr("teamNotAllowed") };
  }
  const { data: team } = await svc
    .from("team")
    .select("status")
    .eq("account_id", teamId)
    .maybeSingle();
  if (team?.status !== "active") {
    return { status: 409, message: tr("teamFrozen") };
  }
  return null;
}

/** An Owner changes the team's username, bio, website or social links. */
export async function updateTeamProfileCore(
  svc: ServiceRoleClient,
  userId: string,
  input: { teamId: string } & TeamProfilePatch,
): Promise<Ok<{ username: string; changed: string[] }> | Fail> {
  const patch: Record<string, unknown> = {};
  if (input.username !== undefined) {
    const handle = normalizeUsernameInput(input.username);
    if (usernameProblem(handle) !== null) {
      return { status: 400, message: tr("teamUsernameInvalid") };
    }
    patch.username = handle;
  }
  if (input.bio !== undefined) {
    const bio = input.bio.trim();
    if (bio.length > BIO_MAX) {
      return { status: 400, message: tr("invalidInput") };
    }
    patch.bio = bio;
  }
  if (input.website !== undefined) {
    const website = input.website.trim();
    if (website !== "" && !WEBSITE_URL_REGEX.test(website)) {
      return { status: 400, message: tr("invalidInput") };
    }
    patch.website = website;
  }
  if (input.socialLinks !== undefined) {
    const checked = normalizeListerSocialLinks(input.socialLinks);
    if (!checked.ok) {
      return {
        status: 400,
        message: tr("profileSocialLinksInvalid"),
        data: { invalidSocialLinks: checked.invalid },
      };
    }
    patch.social_links = checked.links ?? null;
  }
  if (Object.keys(patch).length === 0) {
    return { status: 400, message: tr("nothingToUpdate") };
  }

  const refused = await requireProfileOwner(svc, userId, input.teamId);
  if (refused) return refused;

  const { data, error } = await svc.rpc("team_update_profile", {
    p_team: input.teamId,
    p_by: userId,
    p_patch: patch as never,
  });
  if (error) return failFromDb(error, "updateTeamProfileCore");
  const result = (data ?? {}) as { username?: string; fields?: string[] };
  const changed = [
    ...(result.fields ?? []),
    ...((data as { username_changed?: boolean } | null)?.username_changed
      ? ["username"]
      : []),
  ];
  return {
    status: 200,
    message: tr("teamProfileSaved"),
    data: { username: result.username ?? "", changed },
  };
}

/**
 * A signature to upload the team's photo straight to Cloudinary, into the
 * team's own folder (user_profiles/<team>/), issued only to an Owner.
 */
export async function teamPhotoUploadSignatureCore(
  svc: ServiceRoleClient,
  userId: string,
  teamId: string,
): Promise<UploadSignatureResult | Fail> {
  const refused = await requireProfileOwner(svc, userId, teamId);
  if (refused) return refused;
  return buildCloudinaryUploadSignature(userId, "avatar", {
    folderOwnerId: teamId,
  });
}

/**
 * Saves the photo an Owner uploaded with that signature: it must sit in
 * the team's folder; the team's image history records it (the avatar
 * owner check, enforce_avatar_public_id_owner, accepts the team's folder).
 */
export async function saveTeamPhotoCore(
  svc: ServiceRoleClient,
  userId: string,
  input: {
    teamId: string;
    publicId: string;
    version: number | string;
    transformation?: string | null;
  },
): Promise<Ok<{ avatarPublicId: string; avatarVersion: string }> | Fail> {
  if (!input.publicId.startsWith(`user_profiles/${input.teamId}/`)) {
    return { status: 403, message: tr("notAuthorizedForThisImage") };
  }
  const refused = await requireProfileOwner(svc, userId, input.teamId);
  if (refused) return refused;
  const version = String(input.version);
  const { error } = await svc.rpc("team_update_profile", {
    p_team: input.teamId,
    p_by: userId,
    p_patch: {
      avatar_public_id: input.publicId,
      avatar_version: version,
      transformation: input.transformation ?? null,
    } as never,
  });
  if (error) {
    logger.warn(`saveTeamPhotoCore: ${error.message}`);
    return failFromDb(error, "saveTeamPhotoCore");
  }
  return {
    status: 200,
    message: tr("teamPhotoSaved"),
    data: { avatarPublicId: input.publicId, avatarVersion: version },
  };
}
