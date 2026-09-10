"use client";

import { getRewardsProgram } from "@/actions/getRewardsProgram";
import { useQuery } from "@tanstack/react-query";

// Whether Abonten Rewards is switched on for the current visitor (it rolls
// out by audience: staff → beta → everyone) plus the active reward terms.
// Used to decide whether to show Rewards entry points at all.
export function useRewardsProgram() {
  return useQuery({
    queryKey: ["rewards-program"],
    queryFn: async () => (await getRewardsProgram()).data,
    staleTime: 5 * 60 * 1000,
  });
}
