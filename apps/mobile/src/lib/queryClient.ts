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
export function handleAuthExpiry(): void {
  if (handlingExpiry) return;
  handlingExpiry = true;
  supabase.auth
    .signOut()
    .catch(() => {})
    .finally(() => {
      handlingExpiry = false;
    });
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
