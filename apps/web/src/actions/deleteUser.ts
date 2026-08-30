"use server";

import { createClient } from "@/config/supabase/server";
import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import { logger } from "@abonten/core/logger";

export default async function deleteUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    logger.error(`Error fetching user: ${userError?.message}`);

    return { status: 401, message: "User not Logged in" };
  }

  // auth.admin.* requires the service-role key -- the cookie-scoped client
  // above only carries the anon key + this user's own session, so it's used
  // here only to authenticate who's calling, not to perform the deletion
  // itself (same split used by src/actions/verifyPhoneSignIn.ts and
  // src/actions/updateVerifiedPhone.ts).
  const serviceClient = getSupabaseServiceClient();

  const { error: deleteUserError } = await serviceClient.auth.admin.deleteUser(
    user.id,
  );

  if (deleteUserError) {
    logger.error(`Error deleting user: ${deleteUserError.message}`);

    return { status: 500, message: "Something went wrong! Try again" };
  }

  return { status: 200, message: "User deleted successfully!" };
}
