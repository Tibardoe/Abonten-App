"use client";
import { supabase } from "@/config/supabase/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

// A JWT that expired or was revoked elsewhere, and a missing resource, will
// never succeed on a retry — retrying them only makes the user wait through
// the backoff before the screen reaches its own error/not-found state.
function isTerminalError(error: unknown): boolean {
  const e = error as
    | { code?: string; status?: number; message?: string }
    | null
    | undefined;
  if (!e) return false;
  if (e.code === "PGRST301" || e.code === "PGRST302") return true;
  if (e.code === "PGRST116") return true; // no rows
  if (e.status === 401 || e.status === 403 || e.status === 404) return true;
  return (
    typeof e.message === "string" && /jwt (expired|invalid)/i.test(e.message)
  );
}

export default function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // This client previously ran on library defaults, which meant
            // staleTime 0 + refetchOnWindowFocus — every query refetched on
            // every remount and every time the tab regained focus, so simply
            // alt-tabbing back re-ran every mounted query on the page. 30s
            // matches the native client so both platforms behave the same.
            //
            // Data that genuinely needs to be fresher sets its own value:
            // ticket availability polls every 20s inside the checkout modal,
            // and the unread badges poll on their own interval. Nothing on
            // the money path depends on a refetch-on-mount — checkout and
            // payment state are re-validated server-side at the point of the
            // write, never trusted from a cached read.
            staleTime: 30_000,
            // Keep a screen's data around long enough that going back to it
            // renders from cache instead of showing a spinner again.
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: (failureCount, error) =>
              isTerminalError(error) ? false : failureCount < 2,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
          },
          mutations: {
            // Never silently auto-retry a write (a payment, a cancel, a
            // claim) — the caller decides.
            retry: 0,
          },
        },
      }),
  );

  // Keeps every "who's signed in"-derived query (useCurrentUser and
  // everything layered on top of it) reactive instead of relying purely on
  // staleTime-based refetch. Most sign-in/out flows in this app already
  // force a full page reload (see authService.ts/AuthModal.tsx comments),
  // which makes this redundant for the tab that performed the action -- but
  // it's what keeps *other* open tabs, and Supabase's own background token
  // refresh, in sync without a reload. SIGNED_OUT also clears the whole
  // cache as a safety net so no wallet/ticket/profile data lingers if that
  // reload pattern ever changes.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        queryClient.removeQueries();
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        queryClient.invalidateQueries({ queryKey: ["auth-user"] });
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
