import { useSession } from "@/auth/SessionProvider";
import { PERSIST_RULES } from "@/lib/queryPersistPolicy";
import {
  matchPersistRule,
  selectPersistedQueries,
} from "@abonten/core/query/persistPolicy";
import {
  IsRestoringProvider,
  type Query,
  type QueryCacheNotifyEvent,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type PersistedClient,
  type Persister,
  persistQueryClientRestore,
  persistQueryClientSave,
} from "@tanstack/react-query-persist-client";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState } from "react-native";
import { deleteQueryCacheFiles, queryCacheFile } from "./queryCacheFiles";
import { queryClient } from "./queryClient";

// Offline-first cache: what the app had already loaded is on screen straight
// after a cold start — with or without a connection — and is then
// revalidated in the background. React Query stays the single source of
// truth; this only dehydrates the allowlisted part of its cache to a file
// (queryPersistPolicy.ts decides what and how much) and hydrates it back
// before the first screen renders.
//
// Lifecycle:
//   1. SessionProvider reads the persisted session from secure-store.
//   2. QueryPersistence restores THAT user's file (one file per account, so
//      one person's cache can never be shown to the next), and holds React
//      Query in "restoring" mode meanwhile: queries wait instead of racing
//      the restore with a network request.
//   3. Restored queries carry their original fetch time, so they are stale
//      and every mounted screen refetches them as soon as there is a
//      network. Offline, they stay on screen; nothing claims to be fresh.
//   4. Cache changes to allowlisted queries are written back, throttled,
//      and flushed when the app goes to the background.
//   5. Sign-out deletes the account's file (SessionProvider); a different
//      account signing in deletes the previous one's.

/**
 * Bump when the shape of any persisted query's data changes, so an old file
 * is discarded instead of being fed to code that expects the new shape.
 */
const QUERY_CACHE_VERSION = 2;
/** Older than this, a restored cache is more misleading than useful. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Allowlisted queries stay in memory at least this long, so they reach disk. */
export const PERSISTED_GC_MS = MAX_AGE_MS;
const WRITE_THROTTLE_MS = 2500;
/** A file larger than this is dropped rather than parsed on the JS thread. */
const MAX_FILE_BYTES = 3 * 1024 * 1024;
/** Never hold the splash longer than this for a slow disk. */
const RESTORE_TIMEOUT_MS = 2000;

// The update id changes with every OTA update: a JS bundle that may read
// data differently never sees a cache written by an older one.
const BUSTER = [
  QUERY_CACHE_VERSION,
  Application.nativeApplicationVersion ?? "dev",
  Updates.updateId ?? "embedded",
].join(":");

function createFilePersister(userKey: string): Persister {
  const file = queryCacheFile(userKey);
  return {
    persistClient: (client: PersistedClient) => {
      const queries = selectPersistedQueries(
        client.clientState.queries,
        PERSIST_RULES,
      );
      file.write(
        JSON.stringify({
          ...client,
          clientState: { mutations: [], queries },
        }),
      );
    },
    restoreClient: async () => {
      if (!file.exists) return undefined;
      if ((file.size ?? 0) > MAX_FILE_BYTES) {
        file.delete();
        return undefined;
      }
      return JSON.parse(await file.text()) as PersistedClient;
    },
    removeClient: () => {
      if (file.exists) file.delete();
    },
  };
}

function isPersisted(query: Query): boolean {
  return matchPersistRule(query.queryKey, PERSIST_RULES) !== null;
}

// Only events that change what would be written count: a fetch starting,
// pausing or an observer mounting changes nothing on disk.
function changesPersistedData(event: QueryCacheNotifyEvent): boolean {
  if (!isPersisted(event.query)) return false;
  if (event.type === "added" || event.type === "removed") return true;
  if (event.type !== "updated") return false;
  return event.action.type === "success" || event.action.type === "setState";
}

/** Allowlisted queries outlive the default in-memory gcTime so they reach disk. */
export function applyPersistedQueryDefaults() {
  for (const rule of PERSIST_RULES) {
    queryClient.setQueryDefaults(rule.prefix, { gcTime: PERSISTED_GC_MS });
  }
}

function subscribeWrites(persister: Persister): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const save = () => {
    timer = null;
    if (stopped) return;
    persistQueryClientSave({
      queryClient,
      persister,
      buster: BUSTER,
      dehydrateOptions: {
        shouldDehydrateMutation: () => false,
        // Any allowlisted query holding data — including one whose latest
        // refresh failed; selectPersistedQueries writes that as the success
        // it last was (see @abonten/core/query/persistPolicy).
        shouldDehydrateQuery: (q) =>
          q.state.data !== undefined && isPersisted(q),
      },
    }).catch(() => {
      // Disk full or similar: the in-memory cache is unaffected.
    });
  };

  const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
    if (stopped || !changesPersistedData(event)) return;
    if (!timer) timer = setTimeout(save, WRITE_THROTTLE_MS);
  });

  // The OS may kill a backgrounded app without warning: write now.
  const appState = AppState.addEventListener("change", (state) => {
    if (state !== "active" && timer) {
      clearTimeout(timer);
      save();
    }
  });

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    unsubscribeCache();
    appState.remove();
  };
}

const RestoringContext = createContext(true);

/** True until this account's cached data has been restored (or given up on). */
export function useIsRestoringCache(): boolean {
  return useContext(RestoringContext);
}

export function QueryPersistence({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { session, initializing } = useSession();
  const userKey = initializing ? null : (session?.user.id ?? "anon");
  const [restoredFor, setRestoredFor] = useState<string | null>(null);

  useEffect(() => {
    if (!userKey) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    const persister = createFilePersister(userKey);
    // Another ACCOUNT's cache goes as soon as a different person is signed
    // in. With nobody signed in, nothing is deleted here: that state can be
    // a token that could not be refreshed offline, and sign-out deletes
    // caches itself (SessionProvider).
    if (userKey !== "anon") deleteQueryCacheFiles(userKey);

    const restore = persistQueryClientRestore({
      queryClient: client,
      persister,
      maxAge: MAX_AGE_MS,
      buster: BUSTER,
    }).catch(() => {
      // A corrupt or unreadable file was already removed; start empty.
    });
    const timeout = new Promise<void>((resolve) =>
      setTimeout(resolve, RESTORE_TIMEOUT_MS),
    );

    Promise.race([restore, timeout]).then(() => {
      if (cancelled) return;
      unsubscribe = subscribeWrites(persister);
      setRestoredFor(userKey);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [userKey, client]);

  const restoring = userKey === null || restoredFor !== userKey;
  return (
    <RestoringContext.Provider value={restoring}>
      <IsRestoringProvider value={restoring}>{children}</IsRestoringProvider>
    </RestoringContext.Provider>
  );
}
