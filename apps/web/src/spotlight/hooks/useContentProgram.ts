"use client";

import { getContentProgram } from "@/actions/content/getContentProgram";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { DISABLED_CONTENT_PROGRAM } from "@abonten/types/contentType";
import { useQuery } from "@tanstack/react-query";

// Which Spotlight + Stories features the current visitor may use. Rolls out
// by audience (staff -> beta -> everyone) and fails closed, so every entry
// point hides itself while this resolves or when the programme is off.
// Cached per person, because the answer depends on who is asking.
export function useContentProgram() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const query = useQuery({
    queryKey: ["content", "program", user?.id ?? null],
    enabled: !userLoading,
    queryFn: async () => {
      const res = await getContentProgram();
      return res.status === 200 && res.data ? res.data : null;
    },
    staleTime: 5 * 60 * 1000,
  });
  return {
    ...query,
    program: query.data ?? DISABLED_CONTENT_PROGRAM,
    ready: !userLoading && query.isFetched,
  };
}
