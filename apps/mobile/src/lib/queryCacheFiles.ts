import { Directory, File, Paths } from "expo-file-system";

// Where each account's persisted query cache lives (queryPersistence.tsx),
// and the one place files are deleted. Kept apart from the persistence
// component so the session layer can delete caches on sign-out without an
// import cycle.
//
// Deletion is tied to a real sign-out — never to "no session right now":
// an expired token that cannot be refreshed while offline also reads as "no
// session" for a moment, and deleting the cache then threw away exactly the
// data an offline start needs.

const FILE_PREFIX = "rq-cache-";

export function queryCacheFile(userKey: string): File {
  return new File(Paths.cache, `${FILE_PREFIX}${userKey}.json`);
}

/**
 * Deletes persisted caches. `keep` names the account whose file stays
 * (the signed-in one, or "anon" for public data after a sign-out).
 */
export function deleteQueryCacheFiles(keep: string | null): void {
  try {
    for (const entry of new Directory(Paths.cache).list()) {
      if (!(entry instanceof File)) continue;
      if (!entry.name.startsWith(FILE_PREFIX)) continue;
      if (keep && entry.name === `${FILE_PREFIX}${keep}.json`) continue;
      entry.delete();
    }
  } catch {
    // A leftover file only costs disk space; never block the caller.
  }
}
