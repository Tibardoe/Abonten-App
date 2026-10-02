"use client";

import { getDiscoveryProgram } from "@/actions/discovery/getDiscoveryProgram";
import { takeShellSlice } from "@/hooks/shellBootstrap";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { DISABLED_DISCOVERY_PROGRAM } from "@abonten/types/discoveryType";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Which Discovery features the current visitor may use (new search,
// organizer and place search, alerts and opt-in prompts). Rolls out by
// audience (staff -> beta -> everyone) and fails closed, so every entry
// point can hide itself while this resolves or when the programme is off.
// Cached per person, because the answer depends on who is asking.
export function useDiscoveryProgram() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["discovery-program", user?.id ?? null],
    enabled: !userLoading,
    queryFn: async ({ queryKey }) => {
      const shared = await takeShellSlice(
        client,
        "discoveryProgram",
        user?.id ?? null,
        queryKey,
      );
      if (shared !== undefined) return shared;
      return (await getDiscoveryProgram()).data;
    },
    staleTime: 5 * 60 * 1000,
  });
  return {
    ...query,
    program: query.data ?? DISABLED_DISCOVERY_PROGRAM,
  };
}
