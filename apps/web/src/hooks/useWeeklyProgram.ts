"use client";

import { getWeeklyProgram } from "@/actions/weekly/getWeeklyProgram";
import { takeShellSlice } from "@/hooks/shellBootstrap";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { DISABLED_WEEKLY_PROGRAM } from "@abonten/types/weeklyType";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Whether the current visitor may see Abonten Weekly. Rolls out by audience
// (staff -> beta -> everyone) and fails closed. Keyed by user, because the
// answer depends on who is asking (signing in must not keep the signed-out
// answer).
export function useWeeklyProgram() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["weekly-program", user?.id ?? null],
    enabled: !userLoading,
    queryFn: async ({ queryKey }) => {
      const shared = await takeShellSlice(
        client,
        "weeklyProgram",
        user?.id ?? null,
        queryKey,
      );
      if (shared !== undefined) return shared;
      return (await getWeeklyProgram()).data;
    },
    staleTime: 5 * 60 * 1000,
  });
  return {
    ...query,
    program: query.data ?? DISABLED_WEEKLY_PROGRAM,
    resolving: userLoading || query.isLoading,
  };
}
