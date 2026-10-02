import getShellBootstrap, {
  type ShellBootstrap,
} from "@/actions/getShellBootstrap";
import {
  type SharedFirstAnswer,
  createSharedFirstAnswer,
} from "@abonten/core/sharedFirstAnswer";
import type { QueryClient } from "@tanstack/react-query";

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

export type ShellSlice = Exclude<keyof ShellBootstrap, "userId">;

const shared = new WeakMap<QueryClient, SharedFirstAnswer<ShellBootstrap>>();

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
 * send. Called while the query client is being made (ReactQueryProvider).
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
      return result.status === 200 ? result.data : null;
    },
    ownerOf: (bootstrap) => bootstrap.userId,
    freshForMs: FRESH_FOR_MS,
  });
  shared.set(client, answer);
  answer.prime();
}

/** Forgets the shared answer (the session changed: it was for someone else). */
export function resetShellBootstrap(client: QueryClient): void {
  shared.delete(client);
}

/**
 * A hook's first answer, out of the one shared request, or `undefined`
 * when the hook should ask for itself.
 *
 * `forUserId`: the signed-in user's id for a hook that only runs signed in,
 * null for one whose cache key says "signed out", and left out when the
 * hook's answer does not depend on who is asking.
 */
export async function takeShellSlice<K extends ShellSlice>(
  client: QueryClient,
  slice: K,
  forUserId?: string | null,
): Promise<ShellBootstrap[K] | undefined> {
  if (typeof window === "undefined") return undefined;
  return shared.get(client)?.take(slice, forUserId);
}
