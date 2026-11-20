import { readStoredSession, takeStaleTokenUsed } from "@/auth/storedSession";
import { clearSafetyStorage } from "@/features/safety/safetyStore";
import {
  forgetActingTeam,
  restoreActingTeam,
} from "@/features/teams/actingTeam";
import { noteSignOut } from "@/lib/authRedirect";
import { deleteQueryCacheFiles } from "@/lib/queryCacheFiles";
import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { type Session, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { router } from "expo-router";
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
    let cancelled = false;
    let runningOnStoredSession = false;
    // Whose data to remove from the phone when the session ends.
    let lastUserId: string | null = null;
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
      lastUserId = restored?.user.id ?? lastUserId;
      // The team this account was managing as on this phone, if any.
      if (restored) void restoreActingTeam(restored.user.id);
      setSession(restored);
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // An INITIAL_SESSION with nothing, while offline, is the same
      // unrefreshable-token case handled above: keep what we have.
      if (event === "INITIAL_SESSION" && !next) return;
      const previousUserId = lastUserId;
      lastUserId = next?.user.id ?? null;
      if (next && next.user.id !== previousUserId) {
        void restoreActingTeam(next.user.id);
      }
      setSession(next);
      // First working token after running on the stored (expired) one:
      // whatever was fetched in between went out without a valid token
      // (and got 401s or the signed-out answer). Fetch it again as the
      // person, now that we can.
      // The same applies when the app started online but a token expired
      // while the connection was down (api.ts then sent the stored token).
      if (next && (event === "TOKEN_REFRESHED" || event === "SIGNED_IN")) {
        const staleUsed = takeStaleTokenUsed();
        if (runningOnStoredSession || staleUsed) {
          runningOnStoredSession = false;
          void queryClient.invalidateQueries();
        }
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
        // Safety's offline copy of the trusted contacts goes too.
        if (previousUserId) void clearSafetyStorage(previousUserId);
        // And the team this account was managing as.
        forgetActingTeam(previousUserId);
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
        // Home first, with nothing pushed above it: Home is open to
        // everyone, so no screen that needs a session (Organizer, a ticket,
        // an attendee list) stays behind showing a load error, and the
        // route guard has nothing to send to sign-in. Signing out from a
        // pushed screen used to leave it there ("Couldn't load your
        // dashboard") and bring it back after the next sign-in.
        // "/" is the Home tab itself: the tabs group alone reopens the tab
        // last used (often Account, which needs a session), and the route
        // guard then showed sign-in instead of Home.
        noteSignOut();
        if (router.canDismiss()) router.dismissAll();
        router.replace("/");
        // This phone only. The default ("global") ends every session the
        // account has, so signing out on one device (or on a test phone
        // sharing the account) signed the person out of all the others.
        await supabase.auth.signOut({ scope: "local" });
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
