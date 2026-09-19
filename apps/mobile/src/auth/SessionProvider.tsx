import { deleteQueryCacheFiles } from "@/lib/queryCacheFiles";
import { queryClient } from "@/lib/queryClient";
import { secureStorage } from "@/lib/secureStore";
import { supabase } from "@/lib/supabase";
import { type Session, isAuthRetryableFetchError } from "@supabase/supabase-js";
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

/**
 * The session exactly as supabase-js stored it, without refreshing it — for
 * an offline start with an expired access token (see SessionProvider).
 */
async function readStoredSession(): Promise<Session | null> {
  try {
    const key = (supabase.auth as unknown as { storageKey: string }).storageKey;
    const raw = await secureStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session> | null;
    return parsed?.user?.id && parsed.refresh_token
      ? (parsed as Session)
      : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let runningOnStoredSession = false;
    supabase.auth.getSession().then(async ({ data, error }) => {
      let restored = data.session;
      // Offline with an access token past its hour: the refresh cannot
      // reach the server, so getSession() answers "no session" — but the
      // session is still stored (a network failure never removes it) and
      // will refresh the moment the connection is back
      // (TOKEN_REFRESHED below). Treating that as signed out bounced an
      // offline person to the sign-in screen and hid everything they had
      // cached. Keep them signed in on the stored session instead; any
      // request made with it fails like every other offline request.
      if (!restored && error && isAuthRetryableFetchError(error)) {
        restored = await readStoredSession();
        if (restored) runningOnStoredSession = true;
      }
      if (cancelled) return;
      setSession(restored);
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // An INITIAL_SESSION with nothing, while offline, is the same
      // unrefreshable-token case handled above: keep what we have.
      if (event === "INITIAL_SESSION" && !next) return;
      setSession(next);
      // First working token after running on the stored (expired) one:
      // whatever was fetched in between went out without a valid token
      // (and got 401s or the signed-out answer). Fetch it again as the
      // person, now that we can.
      if (
        runningOnStoredSession &&
        next &&
        (event === "TOKEN_REFRESHED" || event === "SIGNED_IN")
      ) {
        runningOnStoredSession = false;
        void queryClient.invalidateQueries();
      }
      // Session gone (signed out here, revoked on another device, token
      // refresh permanently failed, or the account was deleted) — drop every
      // cached query so the next signed-in user never sees the previous
      // one's data, and any in-flight fetch stops. useProtectedRoute then
      // bounces protected screens to the auth stack. The account's offline
      // cache file goes with it; public data (the "anon" cache) stays.
      if (event === "SIGNED_OUT" || (event === "USER_UPDATED" && !next)) {
        queryClient.clear();
        deleteQueryCacheFiles("anon");
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
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
