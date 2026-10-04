import getShellBootstrap, {
  type ShellBootstrap,
  type ShellPart,
} from "@/actions/getShellBootstrap";
import { isLastingActionFailure } from "@/utils/actionUnreachable";
import {
  type SharedFirstAnswer,
  createSharedFirstAnswer,
} from "@abonten/core/sharedFirstAnswer";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

// The header and the navigation ask a dozen small questions about the
// visitor on every page: which programmes are on for them, how many unread
// messages and notifications, their profile, whether they organise events
// or own a place, which market they are in. Each has its own hook, its own
// cache entry and its own Server Action, and a browser runs Server Actions
// one at a time: a signed-in page opened with ten round trips in a row.
//
// getShellBootstrap answers them together. Each hook's first fetch takes
// its part of that one answer (takeShellSlice); anything later, a poll of
// the unread count or a refetch after a change, goes to the hook's own
// action as before. Nothing else about the hooks changes: same keys, same
// cached shapes. The rules of the sharing (once per part, page-load only,
// never another person's answer) are @abonten/core/sharedFirstAnswer.

export type ShellSlice = ShellPart;

const shared = new WeakMap<QueryClient, SharedFirstAnswer<ShellBootstrap>>();

// The parts of the shared answer that hold a fallback, not an answer: the
// server could not read them, or not in time. A hook uses the fallback (the
// header must not wait), and its query is marked out of date a little
// later, so it asks for itself once the trouble may be over. Without this
// a programme that could not be read stayed "off" for as long as its
// answer is kept: the Weekly link was gone for five minutes after a blip.
const degraded = new WeakMap<QueryClient, Set<ShellSlice>>();
const DEGRADED_RETRY_MS = 30_000;

// A hook that first mounts long after the page opened (a later page, a
// dialog) asks for itself: the shared answer is from page load.
const FRESH_FOR_MS = 15_000;

function viewerTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/**
 * Sends the one request, ahead of everything a page's own queries will
 * send. Called from ReactQueryProvider's layout effect, after the first
 * commit and before any query's own effect.
 */
export function primeShellBootstrap(client: QueryClient): void {
  if (typeof window === "undefined") return;
  if (shared.has(client)) return;
  const answer = createSharedFirstAnswer<ShellBootstrap>({
    ask: async () => {
      const result = await getShellBootstrap({
        viewerTimeZone: viewerTimeZone(),
        viewerLocale:
          typeof navigator !== "undefined" ? navigator.language : null,
      });
      if (result.status !== 200) return null;
      degraded.set(client, new Set(result.data.degraded));
      return result.data;
    },
    ownerOf: (bootstrap) => bootstrap.userId,
    freshForMs: FRESH_FOR_MS,
    // A restricted account, or a page older than the deployment: each
    // hook's own action would be refused the same way.
    failsTogether: isLastingActionFailure,
  });
  shared.set(client, answer);
  answer.prime();
}

/** Forgets the shared answer (the session changed: it was for someone else). */
export function resetShellBootstrap(client: QueryClient): void {
  shared.delete(client);
  degraded.delete(client);
}

/**
 * A hook's first answer, out of the one shared request, or `undefined`
 * when the hook should ask for itself.
 *
 * `forUserId`: the signed-in user's id for a hook that only runs signed in,
 * null for one whose cache key says "signed out", and undefined when the
 * hook's answer does not depend on who is asking.
 *
 * `queryKey`: the asking query's own key (from its queryFn's context), so a
 * part that came back as a fallback is asked for again later.
 */
export async function takeShellSlice<K extends ShellSlice>(
  client: QueryClient,
  slice: K,
  forUserId: string | null | undefined,
  queryKey: QueryKey,
): Promise<ShellBootstrap[K] | undefined> {
  if (typeof window === "undefined") return undefined;
  const value = await shared.get(client)?.take(slice, forUserId);
  if (value !== undefined && degraded.get(client)?.has(slice)) {
    setTimeout(() => {
      client.invalidateQueries({ queryKey, exact: true });
    }, DEGRADED_RETRY_MS);
  }
  return value;
}
