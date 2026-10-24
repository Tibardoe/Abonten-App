"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";

/**
 * Whether one organizer currently shows a Verified badge, and whether their
 * identity is checked.
 *
 * Read separately rather than from the `user_profile_details` view, which
 * does not carry these columns — changing a database view is not something
 * this feature needs. The badge is hidden whenever the account is not
 * Active (status_id 1): a suspended organizer keeps their verification case,
 * but not the public badge.
 */
export const getOrganizerVerified = withActionLocale(
  async function getOrganizerVerified(userId: string): Promise<{
    status: number;
    data: { verified: boolean; identityChecked: boolean };
  }> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_info")
      .select(
        "organizer_verified, identity_verified, identity_valid_until, status_id",
      )
      .eq("id", userId)
      .maybeSingle();
    const active = data?.status_id === 1;

    return {
      status: 200,
      data: {
        verified: !!data?.organizer_verified && active,
        // The person's ID and a live selfie were checked (identity
        // verification); a yes or no, never anything from the document.
        identityChecked:
          !!data?.identity_verified &&
          active &&
          !!data?.identity_valid_until &&
          Date.parse(data.identity_valid_until) > Date.now(),
      },
    };
  },
);
