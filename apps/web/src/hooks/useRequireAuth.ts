"use client";

import { supabase } from "@/config/supabase/client";
import { getSignInUrl } from "@abonten/core/getSignInUrl";
import { usePathname, useRouter } from "next/navigation";

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

  return async () => {
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      // Read at click time, not with useSearchParams(): that hook makes
      // every statically rendered page holding a guarded button (EventCard's
      // favourite, on /weekly and others) bail out of prerendering.
      const query = window.location.search.replace(/^\?/, "");
      router.push(getSignInUrl(query ? `${pathname}?${query}` : pathname));
      return false;
    }

    return true;
  };
}
