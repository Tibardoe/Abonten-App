"use server";

import { createClient } from "@/config/supabase/server";

/**
 * Whether one organizer currently shows a Verified badge.
 *
 * Read separately rather than from the `user_profile_details` view, which
 * does not carry these columns — changing a database view is not something
 * this feature needs. The badge is hidden whenever the account is not
 * Active (status_id 1): a suspended organizer keeps their verification case,
 * but not the public badge.
 */
export async function getOrganizerVerified(
  userId: string,
): Promise<{ status: number; data: { verified: boolean } }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_info")
    .select("organizer_verified, status_id")
    .eq("id", userId)
    .maybeSingle();

  return {
    status: 200,
    data: { verified: !!data?.organizer_verified && data?.status_id === 1 },
  };
}
