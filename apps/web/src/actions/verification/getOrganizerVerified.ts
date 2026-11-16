"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";

/**
 * Whether one organizer currently shows a Verified badge, whether their
 * identity is checked, and whether they are a team (its badges then speak
 * of the team: "Verified business", "ID checked" through an Owner).
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
    data: { verified: boolean; identityChecked: boolean; team: boolean };
  }> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_info")
      .select("organizer_verified, id_checked, account_kind, status_id")
      .eq("id", userId)
      .maybeSingle();
    const active = data?.status_id === 1;

    return {
      status: 200,
      data: {
        verified: !!data?.organizer_verified && active,
        // The person's ID and a live selfie were checked, or for a team one
        // of its Owners' (public.account_id_checked); a yes or no, never
        // anything from the document.
        identityChecked: data?.id_checked === true,
        team: data?.account_kind === "team",
      },
    };
  },
);
