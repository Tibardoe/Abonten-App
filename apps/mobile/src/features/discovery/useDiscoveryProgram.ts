import { api } from "@/lib/api";
import {
  DISABLED_DISCOVERY_PROGRAM,
  type DiscoveryProgram,
} from "@abonten/types/discoveryType";
import { useQuery } from "@tanstack/react-query";

// Which Discovery features this person may use right now: the unified
// search, organizer and place search, alerts and opt-in prompts. Rolls out
// by audience and fails closed, so every entry point hides while this is
// loading, offline without a cached answer, or switched off.
export const DISCOVERY_PROGRAM_KEY = [
  "mobile",
  "discovery",
  "program",
] as const;

export function useDiscoveryProgram() {
  const query = useQuery({
    queryKey: DISCOVERY_PROGRAM_KEY,
    queryFn: async (): Promise<DiscoveryProgram> => {
      const res = await api.discovery.program();
      return res.status === 200 && res.data
        ? res.data
        : DISABLED_DISCOVERY_PROGRAM;
    },
    staleTime: 5 * 60 * 1000,
  });
  return { ...query, program: query.data ?? DISABLED_DISCOVERY_PROGRAM };
}
