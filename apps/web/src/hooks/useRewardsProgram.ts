"use client";

import { getRewardsProgram } from "@/actions/getRewardsProgram";
import { takeShellSlice } from "@/hooks/shellBootstrap";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Whether Abonten Rewards is switched on for the current visitor (it rolls
// out by audience: staff → beta → everyone) plus the active reward terms.
// Used to decide whether to show Rewards entry points at all.
export function useRewardsProgram() {
  const client = useQueryClient();
  return useQuery({
    queryKey: ["rewards-program"],
    queryFn: async () => {
      const shared = await takeShellSlice(client, "rewardsProgram");
      if (shared !== undefined) return shared;
      return (await getRewardsProgram()).data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
