"use client";

import { getSafetyProgram } from "@/actions/safety/getSafetyProgram";
import { takeShellSlice } from "@/hooks/shellBootstrap";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { DISABLED_SAFETY_PROGRAM } from "@abonten/types/safetyType";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Whether the current visitor may use Abonten Safety (signed in, and in the
// programme's audience). Fails closed. Keyed by user: the answer depends on
// who is asking.
export function useSafetyProgram() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["safety-program", user?.id ?? null],
    enabled: !userLoading,
    queryFn: async ({ queryKey }) => {
      const shared = await takeShellSlice(
        client,
        "safetyProgram",
        user?.id ?? null,
        queryKey,
      );
      if (shared !== undefined) return shared;
      return (await getSafetyProgram()).data;
    },
    staleTime: 5 * 60 * 1000,
  });
  return { ...query, program: query.data ?? DISABLED_SAFETY_PROGRAM };
}
