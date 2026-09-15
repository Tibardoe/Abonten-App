import { isNotFoundError } from "@/lib/queryErrors";
import { supabase } from "@/lib/supabase";
import { QueryCache, QueryClient } from "@tanstack/react-query";

// A JWT that expired or was revoked elsewhere (signed out on another device,
// account deleted) surfaces on the next Supabase call as one of these. When
// it does, force a local sign-out — that fires onAuthStateChange("SIGNED_OUT"),
// which clears this cache and bounces protected screens to the auth stack,
// instead of leaving the user staring at repeated "something went wrong".
function isAuthExpiryError(error: unknown): boolean {
  const e = error as
    | { code?: string; status?: number; message?: string }
    | null
    | undefined;
  if (!e) return false;
  if (e.code === "PGRST301" || e.code === "PGRST302") return true;
  if (e.status === 401) return true;
  return (
    typeof e.message === "string" && /jwt (expired|invalid)/i.test(e.message)
  );
}

/**
 * True when the auth server gave a definite verdict that the session is not
 * valid, as opposed to not answering at all. A failure to reach it must not
 * count: offline is not signed out.
 */
function isDefiniteAuthFailure(error: unknown): boolean {
  const e = error as { status?: number; name?: string } | null | undefined;
  if (!e) return false;
  if (typeof e.status === "number") return e.status === 401 || e.status === 403;
  // No status at all is a transport failure (AuthRetryableFetchError).
  return false;
}

let handlingExpiry = false;

/**
 * Drop the dead session so onAuthStateChange("SIGNED_OUT") clears the cache
 * and bounces to the auth stack.
 *
 * Exported because React Query's onError below only sees this for calls that
 * THROW — direct Supabase reads. The typed /api/mobile client deliberately
 * does not throw on an HTTP error status (it returns `{ status }` for the
 * caller to branch on), so a 401 there never reached this handler and the
 * app sat in a signed-in-looking state where every screen showed its
 * "couldn't load, pull down to try again" error forever. lib/api.ts calls
 * this from its fetch wrapper.
 */
export async function handleAuthExpiry(): Promise<void> {
  if (handlingExpiry) return;
  handlingExpiry = true;

  try {
    // Ask the auth server before destroying anything. A 401 from one route
    // is not proof the session is gone: a request can land against a token
    // that is being rotated, or a single endpoint can fail its own auth
    // check, and signing out on that takes a working session away from
    // someone who did nothing wrong. getUser() goes to the auth server
    // rather than reading the cached session, so it answers the actual
    // question. Only a definite "this user is not valid" proceeds; a
    // network failure leaves the session alone, because being offline is
    // not the same as being signed out.
    const { data, error } = await supabase.auth.getUser();
    if (data.user && !error) return;
    if (error && !isDefiniteAuthFailure(error)) return;

    // scope "local" clears this device only. The default is "global", which
    // revokes every session the account has — so one bad 401 on one phone
    // signed the person out of every device they own. If the session really
    // is dead, the server has already forgotten it and there is nothing
    // global left to revoke.
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Never let the sign-out path throw into a fetch handler.
  } finally {
    handlingExpiry = false;
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (!isAuthExpiryError(error)) return;
      handleAuthExpiry();
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Attempt once even with no connection so a screen reaches its own
      // error+retry UI rather than a permanent spinner; auto-refetch on
      // reconnect closes the gap.
      networkMode: "offlineFirst",
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (isAuthExpiryError(error)) return false;
        // A missing/invalid resource won't materialise on a retry — let the
        // screen reach its "not found" state without the backoff wait.
        if (isNotFoundError(error)) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      // Never silently auto-retry a write (a payment, a cancel, a claim) —
      // the caller decides.
      networkMode: "online",
      retry: 0,
    },
  },
});
