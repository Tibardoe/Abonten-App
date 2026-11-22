import { logger } from "@abonten/core/logger";
import {
  type ListerSocialLinks,
  normalizeListerSocialLinks,
} from "@abonten/core/social/listerSocialLinks";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";

// Edit profile, for the website (action updateUserDetails) and the app
// (PATCH /api/mobile/profile): the account's own text fields and its social
// accounts. Written with the CALLER's client: user_info's update policy
// lets a person write only their own row, and the column guards
// (protect_user_info_privileged_columns, the avatar owner check, the
// username rules) apply as they always have.
//
// Only the fields below are ever written, whatever else arrives. Social
// accounts are checked and stored canonical here
// (@abonten/core/social/listerSocialLinks); the database refuses any other
// shape (user_info_social_links_valid). Older app builds still write the
// text fields straight to user_info; they never send social accounts.

type UserInfoUpdate = Database["public"]["Tables"]["user_info"]["Update"];

export type ProfileUpdateInput = {
  username?: unknown;
  full_name?: unknown;
  bio?: unknown;
  website?: unknown;
  avatar_public_id?: unknown;
  avatar_version?: unknown;
  /** network → what was typed; the whole map replaces the stored one. */
  social_links?: unknown;
};

export type ProfileUpdateResult = {
  status: 200 | 400 | 409 | 500;
  message?: string;
  data?: {
    /** What is stored now, canonical (null when none). */
    socialLinks: ListerSocialLinks | null;
    /** The networks that were refused, on a 400. */
    invalidSocialLinks?: string[];
  };
};

const TEXT_FIELDS = [
  "username",
  "full_name",
  "bio",
  "website",
  "avatar_public_id",
  "avatar_version",
] as const;

export async function updateProfileCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: ProfileUpdateInput,
): Promise<ProfileUpdateResult> {
  const patch: UserInfoUpdate = {};
  for (const field of TEXT_FIELDS) {
    const value = input[field];
    if (typeof value !== "string") continue;
    // The forms carry the avatar through unchanged, as "" for someone with
    // no photo. Writing "" over NULL is a change of avatar, which the
    // database refuses (enforce_avatar_public_id_owner), so a person
    // without a photo could not save their profile at all. The avatar is
    // set by the upload flow, never cleared from here.
    if (
      (field === "avatar_public_id" || field === "avatar_version") &&
      value.trim() === ""
    ) {
      continue;
    }
    patch[field] = value.trim();
  }

  let socialLinks: ListerSocialLinks | null | undefined;
  if (input.social_links !== undefined) {
    const checked = normalizeListerSocialLinks(input.social_links);
    if (!checked.ok) {
      return {
        status: 400,
        message: tr("profileSocialLinksInvalid"),
        data: { socialLinks: null, invalidSocialLinks: checked.invalid },
      };
    }
    socialLinks = checked.links;
    patch.social_links = checked.links;
  }

  if (Object.keys(patch).length === 0) {
    return { status: 400, message: tr("nothingToUpdate") };
  }

  const { data, error } = await supabase
    .from("user_info")
    .update(patch)
    .eq("id", userId)
    .select("social_links")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { status: 409, message: tr("profileUsernameTaken") };
    }
    logger.error(`updateProfileCore failed: ${error.message}`);
    return { status: 500, message: tr("profileUpdateFailed") };
  }
  if (!data) {
    // The policy matched no row: not this person's profile.
    logger.error("updateProfileCore: no profile row was updated");
    return { status: 500, message: tr("profileUpdateFailed") };
  }

  return {
    status: 200,
    message: tr("profileUpdatedSuccessfully"),
    data: {
      socialLinks:
        socialLinks !== undefined
          ? socialLinks
          : ((data.social_links as ListerSocialLinks | null) ?? null),
    },
  };
}
