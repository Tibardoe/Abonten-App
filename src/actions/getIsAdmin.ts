"use server";

import { createClient } from "@/config/supabase/server";

// Self-only admin check -- mirrors getUserPlaceRole.ts's "only answer for
// yourself" guard (user.id !== userId is rejected). Used by useIsAdmin() to
// gate admin-only UI (e.g. hiding a future admin nav link); it is never the
// actual security boundary -- every admin action/page re-checks
// user_info.is_admin server-side again on its own, and approve_place_claim
// re-checks it a third time inside the DB function itself.
export async function getIsAdmin(userId: string) {
  const supabase = await createClient();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError || user.id !== userId) {
      return { status: 401, role: "none" };
    }

    const { data: userInfo, error: userInfoError } = await supabase
      .from("user_info")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();

    if (userInfoError) {
      console.log(`Error fetching admin status: ${userInfoError.message}`);
      return { status: 500, message: "Something went wrong!" };
    }

    return { role: userInfo?.is_admin ? "admin" : "none" };
  } catch (error) {
    console.error("Error checking admin status:", error);
    return { role: "none" };
  }
}
