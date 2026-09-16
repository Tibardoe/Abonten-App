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
      return res.status === 200 && res.data
        ? res.data
        : DISABLED_CONTENT_PROGRAM;
    },
    staleTime: 5 * 60 * 1000,
  });
  return {
    ...query,
    program: query.data ?? DISABLED_CONTENT_PROGRAM,
    ready: query.isFetched,
  };
}
