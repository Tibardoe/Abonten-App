"use client";

import { supabase } from "@/config/supabase/client";
import { getSignInUrl } from "@/utils/getSignInUrl";
import { usePathname, useRouter } from "next/navigation";

/**
 * Returns an async guard for protected actions (buy ticket, favorite, ...):
 * call it before performing the action. If no user is signed in, it
 * redirects to sign-in with the current page as `next` and returns false;
 * the caller should bail out without performing the action.
 */
export function useRequireAuth() {
  const router = useRouter();
  const pathname = usePathname();

  return async () => {
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      router.push(getSignInUrl(pathname));
      return false;
    }

    return true;
  };
}
