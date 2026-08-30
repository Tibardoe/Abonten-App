"use client";

import { supabase } from "@/config/supabase/client";
import { getSignInUrl } from "@abonten/core/getSignInUrl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Returns an async guard for protected actions (buy ticket, favorite, ...):
 * call it before performing the action. If no user is signed in, it
 * redirects to sign-in with the current page (path + query string, so
 * e.g. an open tab/filter survives the round trip) as `next` and returns
 * false; the caller should bail out without performing the action.
 */
export function useRequireAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return async () => {
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      const query = searchParams.toString();
      router.push(getSignInUrl(query ? `${pathname}?${query}` : pathname));
      return false;
    }

    return true;
  };
}
