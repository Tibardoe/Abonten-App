"use client";

import { getContentProgram } from "@/actions/content/getContentProgram";
import { takeShellSlice } from "@/hooks/shellBootstrap";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import { DISABLED_CONTENT_PROGRAM } from "@abonten/types/contentType";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Which Spotlight + Stories features the current visitor may use. Rolls out
// by audience (staff -> beta -> everyone) and fails closed, so every entry
// point hides itself while this resolves or when the programme is off.
// Cached per person, because the answer depends on who is asking.
export function useContentProgram() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["content", "program", user?.id ?? null],
    enabled: !userLoading,
    queryFn: async ({ queryKey }) => {
      const shared = await takeShellSlice(
        client,
        "contentProgram",
        user?.id ?? null,
        queryKey,
      );
      if (shared !== undefined) return shared;
      const res = await getContentProgram();
      answerOrThrow(res);
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
