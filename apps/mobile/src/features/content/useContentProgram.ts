import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import {
  type ContentProgram,
  DISABLED_CONTENT_PROGRAM,
} from "@abonten/types/contentType";
import { useQuery } from "@tanstack/react-query";

// Which Spotlight + Stories features this person may use. Rolls out by
// audience and fails closed: every entry point hides while this is loading,
// offline without a cached answer, or switched off. Cached per person,
// because the answer depends on who is asking.
export const CONTENT_KEY = ["mobile", "content"] as const;

export function useContentProgram() {
  const { session } = useSession();
  const query = useQuery({
    queryKey: [...CONTENT_KEY, "program", session?.user.id ?? null],
    queryFn: async (): Promise<ContentProgram> => {
      const res = await api.content.program();
      // A server hiccup must not replace a known answer (possibly
      // restored from disk) with "switched off": throw so React Query
      // keeps the last good value. A definite answer still applies.
      if (res.status >= 500 || res.status === 429) {
        throw new Error(res.message ?? "Programme check failed");
      }
      return res.status === 200 && res.data
        ? res.data
        : DISABLED_CONTENT_PROGRAM;
    },
    staleTime: 5 * 60 * 1000,
    // Signing in changes the key (the answer is per person). Keep showing
    // the previous answer until the new one arrives, so the tab bar and
    // entry points don't disappear and reappear around a sign-in.
    placeholderData: (previous) => previous,
  });
  return {
    ...query,
    program: query.data ?? DISABLED_CONTENT_PROGRAM,
    ready: query.isFetched,
  };
}
