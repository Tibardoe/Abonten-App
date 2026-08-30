"use client";
import { supabase } from "@/config/supabase/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export default function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());

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
