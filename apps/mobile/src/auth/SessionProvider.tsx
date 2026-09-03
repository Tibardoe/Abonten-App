import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type SessionContextValue = {
  session: Session | null;
  /** True until the persisted session has been read back from secure-store. */
  initializing: boolean;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(
  undefined,
);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      // Session gone (signed out here, revoked on another device, token
      // refresh permanently failed, or the account was deleted) — drop every
      // cached query so the next signed-in user never sees the previous
      // one's data, and any in-flight fetch stops. useProtectedRoute then
      // bounces protected screens to the auth stack.
      if (event === "SIGNED_OUT" || (event === "USER_UPDATED" && !next)) {
        queryClient.clear();
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      initializing,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, initializing],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within <SessionProvider>");
  }
  return ctx;
}
