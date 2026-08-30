import { createClient } from "@/config/supabase/server";
import { getSignInUrl } from "@/utils/getSignInUrl";
import { redirect } from "next/navigation";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// "Go to my profile" entry point. Callers that know they're dealing with a
// signed-in user but don't (yet) have the username to hand -- e.g.
// MobileNavBar's account button in the moment right after sign-in, before
// the client-side profile fetch resolves -- link here and let the server
// resolve the actual /user/[username]/posts destination. Middleware already
// guards this path for auth; the check below is a belt-and-braces fallback.
export default async function page() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(getSignInUrl("/user-account"));
  }

  const { data } = await supabase
    .from("user_info")
    .select("username")
    .eq("id", user.id)
    .single();

  if (data?.username) {
    redirect(`/user/${data.username}/posts`);
  }

  // Signed in but no profile row/username yet -- send them to finish setting
  // up their profile rather than to a dead end.
  redirect("/settings/edit-profile");
}
